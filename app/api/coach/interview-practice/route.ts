import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import {
  ContextBudgetExceededError,
  assertContextFits,
  renderContextForPrompt,
} from "@/lib/coach-harness";
import { evaluateQuickPractice } from "@/lib/interview/practice";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

/**
 * 单题面试练习。
 *
 * 关键改动（M3）：以前直接拼 `${jobDescription}` / `${resumeText}` 进
 * prompt，3 万字 JD 完全不被预算管控。现在用 ContextBundle 编译 +
 * assertContextFits fail-loud：
 *   - jobDescription 走 `required:attachment`（缺它就没法判读题）
 *   - resumeText 走 `priority:attachment`（装不下就降级，不是断子）
 *   - question 走 `required:question_source`
 *   - answer 走 `required:current_input`
 *
 * 单题 prompt 自己有「面试题 / 候选人回答」两段，所以渲染时用
 * excludeKinds 把 question_source 和 current_input 从上下文里拿掉，
 * 避免模型读两遍。
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const opportunityId = String(body.opportunityId || "").trim();
  const question = String(body.question || "").trim().slice(0, 2_000);
  const answer = String(body.answer || "").trim().slice(0, 12_000);
  const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
  const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
  if (!opportunityId || !question || !answer) {
    return NextResponse.json({ ok: false, error: "请先完成回答" }, { status: 400 });
  }

  const db = await getDbClient();
  if (!db) return NextResponse.json({ ok: false, error: "数据库不可用" }, { status: 500 });
  const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
    .select("id").eq("id", opportunityId).eq("user_id", user.id).maybeSingle();
  if (opportunityError) return NextResponse.json({ ok: false, error: "岗位校验失败" }, { status: 500 });
  if (!opportunity) return NextResponse.json({ ok: false, error: "岗位不存在" }, { status: 404 });

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { count, error: countError } = await db.from("coach_opportunity_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .eq("snapshot_type", "interview_feedback")
    .contains("metadata", { mode: "quick_practice" })
    .gte("frozen_at", dayStart.toISOString());
  if (countError) return NextResponse.json({ ok: false, error: "练习记录校验失败" }, { status: 500 });
  if ((count || 0) >= 3) {
    return NextResponse.json({ ok: false, error: "今天的 3 次免费单题分析已用完，可继续使用模拟面试圆桌" }, { status: 429 });
  }

  const createdAt = new Date().toISOString();
  try {
    // 题目 + 简历 + JD 三块材料同时进来，用 attachment 槽位让每份独立计价：
    // 哪一份被预算舍去在 selection.excluded 里说得出，不是把整段截掉。
    const { getContextBundleForUser } = await import("@/lib/coach-harness/repository");
    const context = await getContextBundleForUser({
      userId: user.id,
      task: "mock_interview",
      opportunityId,
      questionSource: { id: "quick-practice-question", text: question },
      currentInput: answer,
      attachments: [
        { id: "job-description", label: "本次粘贴的岗位要求", text: jobDescription, required: true },
        { id: "resume-text", label: "本次粘贴的简历", text: resumeText, required: false },
      ],
      budget: { maxInputTokens: 12_000 },
    });

    // PRD §5.1 fail-loud：JD 装不下就拒绝生成，不能截断后让模型继续判读。
    assertContextFits(context);

    // 题目和回答由 prompt 的「面试题 / 候选人回答」两段独立承载，
    // 不再让 question_source / current_input 同时出现在上下文列表里。
    const rendered = renderContextForPrompt(context, {
      excludeKinds: ["question_source", "current_input"],
    });

    const analysis = await evaluateQuickPractice({
      question,
      answer,
      contextText: rendered.text,
      warnings: rendered.warnings,
      context: rendered,
    });
    const record = { id: crypto.randomUUID(), question, answer, ...analysis, createdAt };
    const snapshot = await createOpportunitySnapshot({
      userId: user.id,
      opportunityId,
      snapshotType: "interview_feedback",
      title: `单题练习 · ${question.slice(0, 48)}`,
      content: record,
      createdBy: "hosted_ai",
      metadata: {
        mode: "quick_practice",
        verdict: analysis.verdict,
        contextFingerprint: context.fingerprint,
        contextUsedTokens: rendered.usedTokens,
        contextBudget: context.budget.maxInputTokens,
        contextIncluded: context.selection.included.length,
        contextExcluded: context.selection.excluded.length,
      },
    });
    return NextResponse.json({
      ok: true,
      record: { ...record, id: String(snapshot.id || record.id) },
      remainingToday: Math.max(0, 2 - (count || 0)),
      context: {
        fingerprint: context.fingerprint,
        usedTokens: rendered.usedTokens,
        budget: context.budget.maxInputTokens,
        included: context.selection.included.length,
        excluded: context.selection.excluded.length,
        warnings: rendered.warnings,
      },
    });
  } catch (error) {
    await createOpportunitySnapshot({
      userId: user.id,
      opportunityId,
      snapshotType: "interview_feedback",
      title: `单题练习待分析 · ${question.slice(0, 48)}`,
      content: { id: crypto.randomUUID(), question, answer, status: "analysis_failed", createdAt },
      createdBy: "system",
      metadata: { mode: "quick_practice", status: "analysis_failed" },
    }).catch(() => undefined);
    console.error("Quick interview practice failed", error);
    // 预算溢出由用户决策恢复：换更短 JD、删简历或拆材料——走 422 给 blocked[]。
    if (error instanceof ContextBudgetExceededError) {
      return NextResponse.json({ ok: false, error: error.message, blocked: error.blocked, saved: true }, { status: 422 });
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return NextResponse.json({ ok: false, saved: true, error: "回答已保存，但 AI 分析暂时失败，请重试" }, { status: 502 });
  }
}