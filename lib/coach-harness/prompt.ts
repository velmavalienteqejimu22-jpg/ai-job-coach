import { estimateTokens } from "./context";
import type {
  ContextBundle,
  ContextItemKind,
  ContextSelectionEntry,
  PromptRenderResult,
  PromptSection,
  SelectionRule,
  TrustType,
} from "./types";

/**
 * 把 ContextBundle 的 selection.included 渲染成可直接塞进 Prompt 的文本。
 *
 * 这条链路存在的唯一理由：以前每个 route 都自己写
 *   context.claims.filter(...).slice(0, 160)
 * 手搓 prompt。那是独立于 budget 的二次裁剪，Context Compiler 算出来的
 * 预算和取舍全是摆设——selection 里记录「装了 3 条」，prompt 里实际塞了 60 条。
 *
 * 铁律：本文件只做「按 selection.included 原顺序取原文、加标注」，
 * 不做任何二次过滤、排序或切片。取舍决策已经在 compileContextBundle 里做完了。
 */

/** 让模型看得见每条材料的可信等级。不可引用的内容不出现在 context 里，所以这里只需区分"要不要提醒"。 */
const TRUST_LABEL: Record<TrustType, string> = {
  user_confirmed: "已确认",
  externally_verified: "已核验",
  user_material: "待确认·用户材料",
  user_input: "本次输入",
  retrieved_knowledge: "知识库",
  ai_derived: "派生·不可当事实",
};

const KIND_LABEL: Record<ContextItemKind, string> = {
  current_input: "当前输入",
  question_source: "题目/材料原文",
  attachment: "附带材料",
  opportunity: "目标岗位",
  confirmed_fact: "事实",
  recent_practice: "最近练习",
  artifact: "已有产物",
  knowledge: "知识单元",
  history_summary: "历史摘要",
};

/** 只有这几类需要提醒模型「不能当已确认事实用」。 */
function needsCaveat(trustType: TrustType): boolean {
  return trustType === "ai_derived" || trustType === "retrieved_knowledge";
}

/**
 * 按 refId 取回原文。取不到返回 null——这是完整性问题，不是可忽略的情况，
 * 调用方必须看到 warning：selection 说装了这条，但内容不在 bundle 里。
 */
function resolveText(entry: ContextSelectionEntry, bundle: ContextBundle): string | null {
  switch (entry.kind) {
    case "current_input":
      return bundle.currentInput || null;
    case "question_source":
      return bundle.questionSource?.text || null;
    case "opportunity": {
      const opportunity = bundle.opportunity;
      if (!opportunity) return null;
      return [opportunity.company, opportunity.role, opportunity.jdText || ""]
        .filter(Boolean)
        .join("\n");
    }
    case "attachment": {
      const attachment = bundle.attachments.find((item) => item.id === entry.refId);
      if (!attachment) return null;
      return `《${attachment.label}》\n${attachment.text}`;
    }
    case "confirmed_fact": {
      const claim = bundle.claims.find((item) => item.id === entry.refId);
      if (!claim) return null;
      return claim.sourceExcerpt
        ? `${claim.displayText}\n原文：${claim.sourceExcerpt}`
        : claim.displayText;
    }
    case "recent_practice":
    case "artifact": {
      const artifact = bundle.artifacts.find((item) => item.id === entry.refId);
      if (!artifact) return null;
      return `《${artifact.title}》\n${JSON.stringify(artifact.content ?? "")}`;
    }
    case "knowledge": {
      const item = bundle.knowledge.find((k) => k.id === entry.refId);
      if (!item) return null;
      return `${item.title}\n${item.description}\n目标：${item.goal}\n适用：${item.scope}`;
    }
    case "history_summary":
      return bundle.historySummary?.text || null;
    default:
      return null;
  }
}

/** 渲染成一行带标注的文本。refId 用 [id] 包住，模型输出的引用能被 traced 回来。 */
function renderSection(section: Omit<PromptSection, "text"> & { text: string }): string {
  const caveat = needsCaveat(section.trustType)
    ? "（仅供参考，不可写进对外材料）"
    : "";
  return `【${KIND_LABEL[section.kind]}·${TRUST_LABEL[section.trustType]}】[${section.refId}]${caveat}\n${section.text}`;
}

/**
 * 把 bundle 渲染成 prompt 上下文文本。
 *
 * 严格按 selection.included 的顺序输出——这个顺序就是 compileContextBundle
 * 按 PRIORITY_ORDER 装填的顺序（当前输入 → 题目原文 → 岗位 → 事实 → 练习
 * → 产物 → 知识 → 摘要），模型先看到高优先级内容。
 *
 * @param bundle 已编译的 ContextBundle
 * @param options.header 可选抬头，比如任务说明
 * @param options.excludeKinds 不想渲染进文本的 kind，例如「单题练习 prompt
 *   自己有"面试题/候选人回答"两段，question_source / current_input 就别再
 *   出现在上下文里」。被排除的 kind 不影响 selection 审计；只是文本上省
 *   一份冗余。
 */
export function renderContextForPrompt(
  bundle: ContextBundle,
  options: { header?: string | null; excludeKinds?: ContextItemKind[] } = {},
): PromptRenderResult {
  const excluded = new Set<ContextItemKind>(options.excludeKinds || []);
  const sections: PromptSection[] = [];
  const warnings: string[] = [];
  let usedTokens = 0;

  for (const entry of bundle.selection.included) {
    if (excluded.has(entry.kind)) continue;
    const text = resolveText(entry, bundle);
    if (text === null || !text.trim()) {
      warnings.push(`selection 记录了 ${entry.kind} [${entry.refId}]，但 bundle 里找不到原文，已跳过。`);
      continue;
    }
    const section: PromptSection = {
      kind: entry.kind,
      refId: entry.refId,
      trustType: entry.trustType,
      rule: entry.rule,
      priority: entry.priority,
      text,
      estimatedTokens: entry.estimatedTokens,
    };
    sections.push(section);
    usedTokens += entry.estimatedTokens;
  }

  const body = sections.map(renderSection).join("\n\n");
  const header = options.header?.trim();
  const text = header ? `${header}\n\n${body}` : body;

  if (bundle.usage.truncated) {
    warnings.push(
      `关键内容超出 ${bundle.budget.maxInputTokens} token 预算，已被舍弃。`
      + "PRD §5.1：必须拆任务或让用户选择，不能截断后继续作结论。",
    );
  }

  return { text, sections, usedTokens, truncated: bundle.usage.truncated, warnings };
}

/**
 * PRD §5.1 的 fail-loud 守门：关键原句装不下时直接拒绝生成，
 * 而不是让上层拿着残缺的 context 继续产出看起来完整的建议。
 *
 * 在调用 LLM 之前调用。抛出的错误应该被 route 转成 422 返回给用户，
 * 并带上 context.selection.excluded 里 reason=budget_exhausted 的条目，
 * 让用户自己决定是拆任务、提高预算还是去掉一部分材料。
 */
export function assertContextFits(bundle: ContextBundle): void {
  if (!bundle.usage.truncated) return;
  const blocked = bundle.selection.excluded.filter((entry) => entry.reason === "budget_exhausted");
  const detail = blocked.length
    ? blocked.map((entry) => `${entry.kind} [${entry.refId}] 需要 ${entry.cost} token`).join("；")
    : "未知条目";
  throw new ContextBudgetExceededError(
    `关键内容装不进 ${bundle.budget.maxInputTokens} token 预算：${detail}。请拆任务或选择要保留的材料。`,
    blocked.map((entry) => ({ kind: entry.kind, refId: entry.refId, cost: entry.cost })),
  );
}

/** 预算溢出。route 捕获后应返回 422 并把 blocked 回传给用户做选择。 */
export class ContextBudgetExceededError extends Error {
  readonly blocked: Array<{ kind: ContextItemKind; refId: string; cost: number }>;
  readonly status = 422;

  constructor(message: string, blocked: Array<{ kind: ContextItemKind; refId: string; cost: number }>) {
    super(message);
    this.name = "ContextBudgetExceededError";
    this.blocked = blocked;
  }
}

/**
 * 只渲染「可引用」的事实，供需要模型输出 sourceIds 的场景使用。
 *
 * 注意这里过滤的是 allowedClaimIds / unverifiedClaimIds 两个清单，
 * 不是重新判断可信性——判断已经在 compileContextBundle 里做完了。
 * 而且过滤后仍在 selection.included 的范围内，不会把被预算舍弃的条数捞回来。
 */
export function renderCitableFactsForPrompt(bundle: ContextBundle): {
  text: string;
  ids: string[];
  warnings: string[];
  usedTokens: number;
} {
  const citableIds = new Set([...bundle.allowedClaimIds, ...bundle.unverifiedClaimIds]);
  const warnings: string[] = [];
  const lines: string[] = [];
  const ids: string[] = [];
  let usedTokens = 0;

  // 遍历 selection.included 而不是 bundle.claims：被预算舍弃的事实不能在这儿被捞回来。
  for (const entry of bundle.selection.included) {
    if (entry.kind !== "confirmed_fact") continue;
    if (!citableIds.has(entry.refId)) continue;
    const claim = bundle.claims.find((item) => item.id === entry.refId);
    if (!claim) {
      warnings.push(`事实 [${entry.refId}] 被标记为可引用，但 bundle 里找不到原文。`);
      continue;
    }
    if (claim.visibility === "private") continue;
    lines.push(`[${claim.id}] ${claim.displayText}`);
    ids.push(claim.id);
    usedTokens += entry.estimatedTokens;
  }

  if (bundle.usage.truncated) {
    warnings.push("关键内容超出预算被舍弃，可引用事实清单可能不完整。");
  }

  return { text: lines.join("\n"), ids, warnings, usedTokens };
}

/**
 * 便捷函数：渲染 + 守门一步到位。绝大多数 route 应该用这个。
 * 顺序很重要——先 assert 再 render，避免在溢出的 context 上白做渲染。
 */
export function buildPromptContext(
  bundle: ContextBundle,
  options: { header?: string | null; excludeKinds?: ContextItemKind[] } = {},
): PromptRenderResult {
  assertContextFits(bundle);
  return renderContextForPrompt(bundle, options);
}

/** 估算一段额外文本（比如用户直接粘贴的 JD）会占用多少 token，便于 route 提前判断。 */
export function estimatePromptTokens(value: string): number {
  return estimateTokens(value);
}

/** 规则代码是否表示"这条被主动舍弃了"。UI 用它决定显示样式。 */
export function isExcludedRule(rule: SelectionRule): boolean {
  return rule.startsWith("excluded:");
}
