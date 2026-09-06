import { createHash } from "node:crypto";
import { findClaimConflicts } from "./consistency";
import {
  DEFAULT_ROUTE_BUDGET,
  isCitableSource,
  type ArtifactReference,
  type CareerClaim,
  type CoachActionType,
  type ContextAttachment,
  type ContextBundle,
  type ContextBudget,
  type ContextExclusionEntry,
  type ContextItemKind,
  type ContextReplayResult,
  type ContextSelectionEntry,
  type OpportunityContext,
  type RouteClass,
  type SelectionRule,
  type TrustType,
} from "./types";

const TASK_CLAIM_TYPES: Record<CoachActionType, Set<string>> = {
  job_decision: new Set(["profile", "experience", "project", "skill", "metric", "education", "preference"]),
  resume_workshop: new Set(["profile", "experience", "project", "skill", "metric", "education"]),
  project_deep_dive: new Set(["experience", "project", "skill", "metric"]),
  mock_interview: new Set(["profile", "experience", "project", "skill", "metric", "preference"]),
  interview_review: new Set(["experience", "project", "skill", "metric", "preference"]),
  follow_up: new Set(["profile", "preference"]),
  application_assist: new Set(["profile", "experience", "project", "skill", "metric", "education", "preference"]),
  // 谈薪只载入条款与个人取舍，不读取完整履历（PRD §5.1）
  offer_negotiation: new Set(["preference"]),
};

/** 安全约束、任务规则和输出 Schema 的固定开销。这部分永远优先于业务内容。 */
const BASE_OVERHEAD_TOKENS = 400;

/**
 * 粗估 token：中文按 1.5 字符/token，其余按 4 字符/token。
 * 用于预算裁剪，不用于计费。
 */
export function estimateTokens(value: string): number {
  if (!value) return 0;
  const cjk = (value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  const rest = value.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

function estimateClaimTokens(claim: CareerClaim): number {
  return estimateTokens([claim.displayText, claim.sourceExcerpt || ""].join("\n")) + 24;
}

function estimateArtifactTokens(artifact: ArtifactReference): number {
  return estimateTokens(JSON.stringify(artifact.content ?? "")) + 24;
}

/** PRD §5.1 优先级：已确认事实 > 最近练习 > 检索知识 > 历史摘要。数字越小越先装。 */
const PRIORITY_ORDER: Record<ContextItemKind, number> = {
  current_input: 0,
  question_source: 1,
  attachment: 2,
  opportunity: 3,
  confirmed_fact: 4,
  recent_practice: 5,
  artifact: 6,
  knowledge: 7,
  history_summary: 8,
};

const BLOCKED_SOURCE_REASON: Record<string, string> = {
  ai_extraction: "这条事实是模型从材料里抽出来的，未经用户确认，不能写进对外材料。",
  system_inference: "这条事实是系统推断的，没有材料支撑。",
};

function trustForClaim(claim: CareerClaim): TrustType {
  if (claim.verificationLevel === "externally_verified") return "externally_verified";
  if (claim.status === "confirmed") return "user_confirmed";
  if (claim.sourceKind === "user_upload") return "user_material";
  if (claim.sourceKind === "user_statement") return "user_input";
  return "ai_derived";
}

function trustForArtifact(artifact: ArtifactReference): TrustType {
  if (artifact.createdBy === "user" || artifact.createdBy === "system") return "user_material";
  return "ai_derived";
}

function claimRank(claim: CareerClaim): number {
  const trust = trustForClaim(claim);
  if (trust === "externally_verified") return 0;
  if (trust === "user_confirmed") return 1;
  if (trust === "user_material") return 2;
  if (trust === "user_input") return 3;
  return 9;
}

function isPracticeArtifact(artifact: ArtifactReference): boolean {
  return ["mock_interview", "interview_review", "interview_plan"].includes(artifact.artifactType);
}

function resolveBudget(input: {
  routeClass?: RouteClass;
  budget?: Partial<ContextBudget>;
}): ContextBudget {
  const routeClass = input.routeClass || "single_inference";
  const defaults = DEFAULT_ROUTE_BUDGET[routeClass];
  return {
    routeClass,
    maxInputTokens: input.budget?.maxInputTokens ?? defaults.maxInputTokens,
    maxModelCalls: input.budget?.maxModelCalls ?? defaults.maxModelCalls,
    maxToolCalls: input.budget?.maxToolCalls ?? defaults.maxToolCalls,
  };
}

export function compileContextBundle(input: {
  task: CoachActionType;
  userId: string;
  opportunity?: OpportunityContext | null;
  claims: CareerClaim[];
  artifacts?: ArtifactReference[];
  knowledge?: ContextBundle["knowledge"];
  knowledgeContext?: string;
  /** 当前用户输入，永远第一优先。 */
  currentInput?: string | null;
  /** 当前题目或材料原文，装不下时必须报错而不是截断。 */
  questionSource?: { id: string; text: string; version?: string | null } | null;
  /** 本次运行附带的其他原文材料。每份独立计价，被舍弃时说得出是哪一份。 */
  attachments?: ContextAttachment[];
  historySummary?: { id: string; text: string } | null;
  intent?: string | null;
  planVersion?: number | null;
  selectedOpportunityIds?: string[];
  deadline?: string | null;
  userOverride?: boolean;
  routeClass?: RouteClass;
  budget?: Partial<ContextBudget>;
  now?: Date;
}): ContextBundle {
  const budget = resolveBudget(input);
  const relevantTypes = TASK_CLAIM_TYPES[input.task];
  const included: ContextSelectionEntry[] = [];
  const excluded: ContextExclusionEntry[] = [];

  // 1. 先分作用域与任务相关性，再排序、预算裁剪。
  //    旧实现先取最近 500 条再过滤，旧岗位的相关证据会在查询阶段就丢掉。
  const scopedClaims = input.claims
    .filter((claim) => relevantTypes.has(claim.entityType))
    .filter((claim) => claim.status !== "withdrawn")
    .sort((a, b) => claimRank(a) - claimRank(b)
      || (b.updatedAt || "").localeCompare(a.updatedAt || "")
      || a.id.localeCompare(b.id));

  // 主动排除：撤回 / 任务不相关 / 来源被拦。这些与预算无关，先记下来。
  for (const claim of input.claims) {
    if (claim.status === "withdrawn") {
      excluded.push({
        kind: "confirmed_fact", refId: claim.id,
        rule: "excluded:withdrawn", priority: PRIORITY_ORDER.confirmed_fact,
        reason: "withdrawn", detail: "这条事实已被撤回。",
        cost: estimateClaimTokens(claim), required: false,
      });
      continue;
    }
    if (!relevantTypes.has(claim.entityType)) {
      excluded.push({
        kind: "confirmed_fact", refId: claim.id,
        rule: "excluded:task_irrelevant", priority: PRIORITY_ORDER.confirmed_fact,
        reason: "task_irrelevant", detail: `${claim.entityType} 与 ${input.task} 无关。`,
        cost: estimateClaimTokens(claim), required: false,
      });
      continue;
    }
    const blocked = BLOCKED_SOURCE_REASON[claim.sourceKind];
    if (blocked && claim.status !== "confirmed") {
      excluded.push({
        kind: "confirmed_fact", refId: claim.id,
        rule: "excluded:blocked_source", priority: PRIORITY_ORDER.confirmed_fact,
        reason: "blocked_source", detail: blocked,
        cost: estimateClaimTokens(claim), required: false,
      });
    }
  }

  const artifacts = [...(input.artifacts || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const knowledge = [...(input.knowledge || [])].sort((a, b) => a.id.localeCompare(b.id));

  // 2. 按优先级装填预算。
  //    关键原句装不下时拆任务或请求选择，不能截断后继续作结论。
  let usedTokens = BASE_OVERHEAD_TOKENS;
  let truncated = false;

  const tryInclude = (
    entry: Omit<ContextSelectionEntry, "estimatedTokens" | "priority" | "rule" | "required">,
    tokens: number,
    required: boolean,
    rule: SelectionRule,
  ): boolean => {
    const priority = PRIORITY_ORDER[entry.kind];
    if (usedTokens + tokens <= budget.maxInputTokens) {
      usedTokens += tokens;
      included.push({ ...entry, estimatedTokens: tokens, priority, rule, required });
      return true;
    }
    if (required) truncated = true;
    excluded.push({
      kind: entry.kind,
      refId: entry.refId,
      rule: required ? "excluded:budget_exhausted" : "excluded:lower_priority",
      priority,
      reason: required ? "budget_exhausted" : "lower_priority",
      detail: required
        ? `关键内容需要 ${tokens} token，超出 ${budget.maxInputTokens} 上限。必须拆任务或让用户选择，不能截断。`
        : `需要 ${tokens} token，剩余预算不足，按优先级舍弃。`,
      cost: tokens,
      required,
    });
    return false;
  };

  if (input.currentInput?.trim()) {
    tryInclude({
      kind: "current_input",
      refId: "current_input",
      trustType: "user_input",
      reason: "当前用户输入优先于所有历史材料。",
    }, estimateTokens(input.currentInput), true, "required:current_input");
  }

  if (input.questionSource?.text.trim()) {
    tryInclude({
      kind: "question_source",
      refId: input.questionSource.id,
      refVersion: input.questionSource.version ?? null,
      trustType: "user_material",
      reason: "当前题目或材料原文，截断后无法可靠作答。",
    }, estimateTokens(input.questionSource.text), true, "required:question_source");
  }

  const keptAttachments: ContextBundle["attachments"] = [];
  for (const attachment of input.attachments || []) {
    if (!attachment.text.trim()) continue;
    const required = Boolean(attachment.required);
    const ok = tryInclude({
      kind: "attachment",
      refId: attachment.id,
      trustType: "user_material",
      reason: required
        ? `本次附带的${attachment.label}，缺它无法作答。`
        : `本次附带的${attachment.label}，装不下时可降级。`,
    }, estimateTokens(attachment.text), required,
    required ? "required:attachment" : "priority:attachment");
    if (ok) keptAttachments.push({
      id: attachment.id, label: attachment.label, text: attachment.text, required,
    });
  }

  if (input.opportunity) {
    const text = [input.opportunity.company, input.opportunity.role, input.opportunity.jdText || ""].join("\n");
    tryInclude({
      kind: "opportunity",
      refId: input.opportunity.id,
      refVersion: String(input.opportunity.jdVersion),
      trustType: "user_material",
      reason: "当前岗位上下文，跨岗位比较时不能串用。",
    }, estimateTokens(text), true, "required:opportunity");
  }

  const keptClaims: CareerClaim[] = [];
  for (const claim of scopedClaims) {
    const blocked = BLOCKED_SOURCE_REASON[claim.sourceKind];
    if (blocked && claim.status !== "confirmed") continue;
    const tokens = estimateClaimTokens(claim);
    const ok = tryInclude({
      kind: "confirmed_fact",
      refId: claim.id,
      refVersion: claim.updatedAt ?? null,
      trustType: trustForClaim(claim),
      reason: claim.status === "confirmed" ? "已确认事实。" : "用户材料，可引用但需确认口径。",
    }, tokens, false, "priority:confirmed_fact");
    if (ok) keptClaims.push(claim);
  }

  const keptArtifacts: ArtifactReference[] = [];
  for (const artifact of artifacts) {
    const tokens = estimateArtifactTokens(artifact);
    const rule: SelectionRule = isPracticeArtifact(artifact)
      ? "priority:recent_practice"
      : "priority:artifact";
    const ok = tryInclude({
      kind: isPracticeArtifact(artifact) ? "recent_practice" : "artifact",
      refId: artifact.id,
      refVersion: String(artifact.version),
      trustType: trustForArtifact(artifact),
      reason: isPracticeArtifact(artifact) ? "最近练习记录。" : "已有产物草稿。",
    }, tokens, false, rule);
    if (ok) keptArtifacts.push(artifact);
  }

  const keptKnowledge: ContextBundle["knowledge"] = [];
  for (const item of knowledge) {
    const tokens = estimateTokens(item.description + item.goal + item.scope);
    const ok = tryInclude({
      kind: "knowledge",
      refId: item.id,
      trustType: "retrieved_knowledge",
      reason: "检索到的知识单元，只用于补充追问和校准，不能当经历。",
    }, tokens, false, "priority:knowledge");
    if (ok) keptKnowledge.push(item);
  }

  if (input.historySummary?.text.trim()) {
    tryInclude({
      kind: "history_summary",
      refId: input.historySummary.id,
      trustType: "ai_derived",
      reason: "历史摘要是派生缓存，事实仍以事实库为准。",
    }, estimateTokens(input.historySummary.text), false, "priority:history_summary");
  }

  // 3. 三条清单回答「能不能引用」。
  //    是否可用由 source_kind 决定，是否提醒由 verification_level 决定。
  const allowedClaimIds: string[] = [];
  const unverifiedClaimIds: string[] = [];
  const blockedClaimIds: string[] = [];
  const blockedClaimDetails: CareerClaim[] = [];
  for (const claim of scopedClaims) {
    const citable = isCitableSource(claim.sourceKind);
    const usable = claim.status !== "withdrawn" && claim.status !== "conflicted";
    if (!usable || !citable) {
      blockedClaimIds.push(claim.id);
      blockedClaimDetails.push(claim);
      continue;
    }
    if (claim.status === "confirmed" && claim.verificationLevel !== "none") allowedClaimIds.push(claim.id);
    else unverifiedClaimIds.push(claim.id);
  }

  const compiledAt = (input.now || new Date()).toISOString();
  const fingerprintPayload = {
    version: 2,
    task: input.task,
    intent: input.intent ?? null,
    planVersion: input.planVersion ?? null,
    selectedOpportunityIds: [...(input.selectedOpportunityIds || [])].sort(),
    opportunity: input.opportunity
      ? { id: input.opportunity.id, jdVersion: input.opportunity.jdVersion, stage: input.opportunity.stage }
      : null,
    claims: keptClaims.map((claim) => [claim.id, claim.status, claim.sourceKind, claim.verificationLevel, claim.updatedAt || ""]),
    attachments: keptAttachments.map((attachment) => [attachment.id, attachment.required]),
    artifacts: keptArtifacts.map((artifact) => [artifact.id, artifact.version, artifact.status]),
    knowledge: keptKnowledge.map((item) => item.id),
    budget,
  };

  return {
    version: 2,
    task: input.task,
    userId: input.userId,
    intent: input.intent ?? null,
    planVersion: input.planVersion ?? null,
    selectedOpportunityIds: input.selectedOpportunityIds ?? (input.opportunity ? [input.opportunity.id] : []),
    deadline: input.deadline ?? input.opportunity?.scheduledInterviewAt ?? null,
    userOverride: Boolean(input.userOverride),
    opportunity: input.opportunity || null,
    claims: keptClaims,
    artifacts: keptArtifacts,
    knowledge: keptKnowledge,
    knowledgeContext: input.knowledgeContext || "",
    currentInput: input.currentInput?.trim() || null,
    questionSource: input.questionSource?.text.trim()
      ? { id: input.questionSource.id, text: input.questionSource.text, version: input.questionSource.version ?? null }
      : null,
    historySummary: input.historySummary?.text.trim()
      ? { id: input.historySummary.id, text: input.historySummary.text }
      : null,
    attachments: keptAttachments,
    allowedClaimIds,
    unverifiedClaimIds,
    blockedClaimIds,
    blockedClaimDetails,
    conflicts: findClaimConflicts(scopedClaims),
    budget,
    selection: { included, excluded },
    usage: { usedTokens, truncated },
    compiledAt,
    fingerprint: createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex"),
  };
}

/**
 * PRD §5.1：用户改目标或材料版本后，旧运行返回的建议先判过期，不能覆盖新计划。
 * 只有实质变化才算过期；编译时间不同不算。
 */
export function contextIsStale(previous: ContextBundle, current: ContextBundle): boolean {
  if (previous.task !== current.task) return true;
  if (previous.intent !== current.intent) return true;
  if (previous.planVersion !== current.planVersion) return true;
  if (previous.selectedOpportunityIds.join(",") !== current.selectedOpportunityIds.join(",")) return true;
  if ((previous.opportunity?.jdVersion ?? 0) !== (current.opportunity?.jdVersion ?? 0)) return true;
  if (previous.fingerprint === current.fingerprint) return false;
  const previousClaims = new Map(previous.claims.map((claim) => [claim.id, claim]));
  for (const claim of current.claims) {
    const before = previousClaims.get(claim.id);
    if (!before) continue;
    if (before.status !== claim.status) return true;
    if (before.verificationLevel !== claim.verificationLevel) return true;
    if (before.sourceKind !== claim.sourceKind) return true;
  }
  return false;
}

/**
 * 用当前最新的物料重跑一次 compileContextBundle，对比 stored 的选择与 fingerprint，
 * 返回是否还能直接复用 stored 的建议。drift 数组具体列出哪些 refId 被加入/移除/改了
 * trustType / status，调用方可以据此提示用户"自上次回答以来 X 条事实发生了变化"。
 *
 * 注意：本函数只基于 selection.included 做差集，不会重渲染 reason 文本。
 * reason 文本本身只是人读说明，重算一次应得到一致结果；如果不一致说明
 * SelectionRule 集合变了，需要升级 contextVersion。
 */
export function replayContextSelection(
  stored: ContextBundle,
  current: Parameters<typeof compileContextBundle>[0],
): ContextReplayResult {
  const now = compileContextBundle({ ...current, now: current.now });
  if (stored.fingerprint === now.fingerprint && stored.selection.included.length === now.selection.included.length) {
    return { matches: true, drift: [], storedFingerprint: stored.fingerprint, currentFingerprint: now.fingerprint };
  }
  const before = new Map(stored.selection.included.map((entry) => [entry.refId, entry]));
  const after = new Map(now.selection.included.map((entry) => [entry.refId, entry]));
  const drift: ContextReplayResult["drift"] = [];
  for (const [refId, next] of after) {
    const prev = before.get(refId);
    if (!prev) {
      drift.push({ kind: next.kind, refId, change: "added", detail: `现在被装进 context：${next.reason}` });
      continue;
    }
    if (prev.trustType !== next.trustType
      || prev.estimatedTokens !== next.estimatedTokens
      || prev.rule !== next.rule
      || (prev.refVersion || null) !== (next.refVersion || null)) {
      drift.push({ kind: next.kind, refId, change: "changed", detail: `${prev.reason} → ${next.reason}` });
    }
  }
  for (const [refId, prev] of before) {
    if (!after.has(refId)) {
      drift.push({ kind: prev.kind, refId, change: "removed", detail: `不再被装入 context：${prev.reason}` });
    }
  }
  return { matches: false, drift, storedFingerprint: stored.fingerprint, currentFingerprint: now.fingerprint };
}
