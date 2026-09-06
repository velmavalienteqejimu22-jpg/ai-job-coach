import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { type ArtifactDraft, type CoachActionType, type ContextAttachment } from "@/lib/coach-harness";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import { validateArtifactDraft } from "@/lib/coach-harness";

export const runtime = "nodejs";

/**
 * 校验草稿。
 *
 * validate 只产出报告，不写库也不调 LLM，所以**不**做 assertContextFits：
 * 就算关键原句装不下，validateArtifactDraft 会把缺失的 claim 报成
 * unknown_claim，这本身就是用户该看的信号，而不是一个隐藏 422。
 *
 * 但 validate 会读 selection：把 context.selection.excluded 里被预算舍去
 * 的条目返回，让前端能告诉用户「哪些事实因为超出预算本次校验未覆盖」。
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const task = body.task as CoachActionType;
    const opportunityId = body.opportunityId ? String(body.opportunityId).trim() : null;
    const questionSource = body.questionSource && typeof body.questionSource === "object"
      ? { id: String(body.questionSource.id || "validate-question-source"), text: String(body.questionSource.text || "").trim(), version: body.questionSource.version ? String(body.questionSource.version) : null }
      : null;
    const currentInput = body.currentInput ? String(body.currentInput) : null;
    const attachments: ContextAttachment[] | undefined = Array.isArray(body.attachments)
      ? (body.attachments as Array<Record<string, unknown>>).slice(0, 8).map((item, index) => ({
        id: String(item.id || `attachment-${index + 1}`),
        label: String(item.label || `附件 ${index + 1}`).slice(0, 60),
        text: String(item.text || ""),
        required: Boolean(item.required),
      })).filter((item) => item.text.trim())
      : undefined;

    if (!task) return NextResponse.json({ ok: false, error: "缺少 task" }, { status: 400 });

    const context = await getContextBundleForUser({
      userId: user.id,
      task,
      opportunityId: opportunityId || undefined,
      questionSource: questionSource?.text ? questionSource : null,
      currentInput,
      attachments,
    });
    const report = validateArtifactDraft(body.draft as ArtifactDraft, context);

    // 把 context 的选择状态一并返回：UI 可以告诉用户「X 条事实被舍弃」
    // 以及「blocked 来源是什么」。
    return NextResponse.json({
      ok: true,
      report,
      contextFingerprint: context.fingerprint,
      context: {
        usedTokens: context.usage.usedTokens,
        budget: context.budget.maxInputTokens,
        truncated: context.usage.truncated,
        included: context.selection.included.length,
        excluded: context.selection.excluded.length,
        allowedClaimIds: context.allowedClaimIds,
        unverifiedClaimIds: context.unverifiedClaimIds,
        blockedClaimIds: context.blockedClaimIds,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "校验失败" }, { status: 400 });
  }
}