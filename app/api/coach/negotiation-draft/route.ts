import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { assertContextFits, renderContextForPrompt } from "@/lib/coach-harness";
import { ContextBudgetExceededError } from "@/lib/coach-harness/prompt";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import { getOffer } from "@/lib/coach-harness/plans";

export const runtime = "nodejs";

/**
 * 谈判问题/沟通草稿生成（PRD §3.1 谈薪行 / 验收 17）。
 *
 * Context：offer 条款 + 个人取舍 + 岗位（可选）。明确不要求简历、JD 或第一课；
 * 不猜测「市场薪资」「可涨幅」（PRD §3.1 禁止行为列）。
 * offer 条款走 currentInput（本任务的必备原文），预算装不下就 fail-loud。
 */

const DRAFT_BUDGET = { maxInputTokens: 8_000 };

function formatTerms(offer: Awaited<ReturnType<typeof getOffer>>): string {
  if (!offer) return "";
  const t = offer.terms;
  const unknownLabel = (value: unknown, label: string) =>
    value === null || value === undefined || value === "" ? `${label}：未知（待确认）` : `${label}：${value}`;
  const lines = [
    unknownLabel(t.base, `固定薪资（${t.currency ?? "币种未确认"}）`),
    unknownLabel(t.bonus, "浮动/奖金"),
    unknownLabel(t.equity, "股权/期权"),
    unknownLabel(t.payCycle, "发放周期"),
    unknownLabel(t.grossOrNet, "税前/税后口径"),
    unknownLabel(t.termMonths, "合同期限"),
    unknownLabel(t.probation, "试用期条款"),
    unknownLabel(t.deadline, "答复截止时间"),
    unknownLabel(t.source, "条款来源"),
  ];
  if (t.unknowns.length) lines.push(`待确认缺项：${t.unknowns.join("、")}`);
  if (offer.priorities.length) lines.push(`个人取舍优先级：${offer.priorities.join(" > ")}`);
  if (offer.notes) lines.push(`备注：${offer.notes}`);
  return lines.join("\n");
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let body: { offerId?: string; opportunityId?: string; extraContext?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.offerId) {
    return NextResponse.json({ ok: false, error: "offerId 必填——先录入 offer 条款" }, { status: 400 });
  }

  try {
    const offer = await getOffer(user.id, body.offerId);
    if (!offer) return NextResponse.json({ ok: false, error: "offer 不存在" }, { status: 404 });

    // Context：条款原文是本任务的必备输入（currentInput），岗位背景可选。
    // 不读取完整学习史/简历——谈薪只载入本次 offer 条款与取舍（PRD §5.1）。
    const context = await getContextBundleForUser({
      userId: user.id,
      task: "offer_negotiation",
      opportunityId: body.opportunityId || offer.opportunityId,
      intent: "为本次 offer 生成谈判问题与沟通草稿",
      currentInput: formatTerms(offer),
      budget: DRAFT_BUDGET,
    });
    assertContextFits(context);
    const rendered = renderContextForPrompt(context, {
      excludeKinds: ["current_input"], // 条款有自己的抬头段落
    });

    const systemPrompt = `你是谈判准备助手。任务：基于用户提供的 offer 条款和个人取舍，产出：
1. questions：3-5 个应该向对方确认或谈判的具体问题（针对条款里的未知项和模糊项优先）
2. draft：一段可以直接发给 HR/对接人的沟通草稿（礼貌、具体、只提条款相关诉求）
3. tradeoffs：帮用户看清取舍的 2-3 句话（基于条款事实，不猜测市场行情）

硬规则：
- 缺项（条款里标注「未知」的）只能变成「向对方确认的问题」，不能编造数字。
- 不生成任何「市场薪资」「可涨幅」数据。
- 只输出严格 JSON：{"questions": string[], "draft": string, "tradeoffs": string[]}`;

    const userPrompt = `【我的 offer 条款】
${formatTerms(offer)}

${rendered.text ? `【相关背景（可引用，注明来源）】\n${rendered.text}` : ""}

请生成谈判问题、沟通草稿和取舍分析，输出严格 JSON。`;

    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000, maxRetries: 1 },
    );

    let parsed: { questions?: unknown; draft?: unknown; tradeoffs?: unknown };
    try {
      const cleaned = String(response).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ ok: false, error: "模型返回不是有效 JSON，请重试" }, { status: 502 });
    }
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : [];
    if (!questions.length || typeof parsed.draft !== "string" || !parsed.draft.trim()) {
      return NextResponse.json({ ok: false, error: "模型返回缺少 questions 或 draft，请重试" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      questions,
      draft: String(parsed.draft),
      tradeoffs: Array.isArray(parsed.tradeoffs)
        ? parsed.tradeoffs.filter((t): t is string => typeof t === "string")
        : [],
      // 如实展示上下文用量与舍弃情况
      contextSummary: {
        usedTokens: context.usage.usedTokens,
        truncated: context.usage.truncated,
        excluded: context.selection.excluded.map((e) => ({ kind: e.kind, rule: e.rule })),
      },
    });
  } catch (error) {
    if (error instanceof ContextBudgetExceededError) {
      return NextResponse.json(
        { ok: false, error: "条款内容超出预算，请精简后重试", blocked: error.blocked },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "草稿生成失败" },
      { status: 500 },
    );
  }
}
