import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  ContextBudgetExceededError,
  applyResumeChanges,
  assertContextFits,
  reviewAtsText,
  validateArtifactDraft,
} from "@/lib/coach-harness";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";
import { runWithGenerationContext } from "@/lib/generation-context";
import { callLLM } from "@/lib/llm";
import type { ResumeChange } from "@/lib/opportunities/types";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

function parseJson(text: string) {
  const match = text.replace(/```json\s*/g, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回格式错误");
  return JSON.parse(match[0]) as { status?: string; summary?: string; findings?: unknown[] };
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });

  try {
    const body = await request.json();
    const opportunityId = String(body.opportunityId || "").trim();
    const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
    const incoming = (Array.isArray(body.changes) ? body.changes : []).slice(0, 20) as ResumeChange[];
    if (!opportunityId || !resumeText || !jobDescription || !incoming.length) {
      return NextResponse.json({ ok: false, error: "缺少待检查的简历修改" }, { status: 400 });
    }

    // 与 resume-draft 保持一致：JD 走 questionSource 纳入预算，装不下就 fail-loud。
    const context = await getContextBundleForUser({
      userId: user.id,
      task: "resume_workshop",
      opportunityId,
      questionSource: { id: "job-description", text: jobDescription },
      budget: { maxInputTokens: 12_000 },
    });
    assertContextFits(context);
    // 可引用 = 来源可引用且状态可用。未逐条确认的事实仍可引用，只是带上口径提醒。
    const citableIds = new Set([...context.allowedClaimIds, ...context.unverifiedClaimIds]);
    const changes = incoming.map((change) => {
      const evidenceIds = (change.evidenceIds || (change.evidenceId ? [change.evidenceId] : []))
        .map(String)
        .filter((id) => citableIds.has(id));
      return {
        ...change,
        section: String(change.section || "经历表述").slice(0, 100),
        before: String(change.before || "").trim().slice(0, 2_000),
        after: String(change.after || "").trim().slice(0, 2_000),
        reason: String(change.reason || "用户调整后的岗位版本").slice(0, 500),
        evidenceId: evidenceIds[0] || null,
        evidenceIds,
      };
    });
    const activeChanges = changes.filter((change) => change.status !== "rejected");
    if (!activeChanges.length || activeChanges.some((change) => !change.after)) {
      return NextResponse.json({ ok: false, error: "修改后的内容不能为空" }, { status: 400 });
    }

    const applied = applyResumeChanges(resumeText, activeChanges);
    const sections = activeChanges.map((change, index) => ({
      path: `changes.${index}.after`,
      content: change.after,
      claimIds: change.evidenceIds || (change.evidenceId ? [change.evidenceId] : []),
    }));
    const facts = validateArtifactDraft({ artifactType: "target_resume", visibility: "recruiter_safe", sections }, context);
    const ats = reviewAtsText(applied.text, jobDescription);
    // 只渲染被 Compiler 装进 selection 的事实：被预算舍弃的不能在这儿被捞回来，
    // 否则质检员看到的事实和起草时看到的不一致，复核结论就不可信。
    const includedRefIds = new Set(
      context.selection.included.filter((entry) => entry.kind === "confirmed_fact").map((entry) => entry.refId),
    );
    const source = context.claims
      .filter((claim) => sections.some((section) => section.claimIds.includes(claim.id)))
      .filter((claim) => includedRefIds.has(claim.id))
      .map((claim) => `[${claim.id}] ${claim.displayText}`)
      .join("\n");

    let reviewer = { status: "failed", summary: "事实检查未通过，未调用独立复核。", findings: [] as unknown[] };
    if (!applied.findings.length && facts.ok) {
      const requestId = String(body.requestId || crypto.randomUUID()).slice(0, 180);
      const output = await runWithGenerationContext({
        userId: user.id,
        operation: "resume_user_edit_review",
        requestId,
      }, () => callLLM([
        { role: "system", content: "你是独立简历质检员。检查用户修改后的每条表述是否被引用事实完整支持，是否扩大职责、结果、技能、数字或时间，以及是否仍对目标 JD 有明确价值。只返回 JSON：{\"status\":\"passed|failed\",\"summary\":\"一句话\",\"findings\":[{\"changeId\":\"...\",\"severity\":\"warning|error\",\"message\":\"...\"}]}" },
        { role: "user", content: `目标 JD：\n${jobDescription}\n\n原简历：\n${resumeText}\n\n引用事实：\n${source}\n\n用户修改后的内容：\n${JSON.stringify(activeChanges)}` },
      ], { provider: "deepseek", temperature: 0, maxTokens: 1_800, timeoutMs: 45_000, maxRetries: 1, responseFormat: "json_object" }));
      const parsed = parseJson(output);
      reviewer = {
        status: parsed.status === "passed" ? "passed" : "failed",
        summary: String(parsed.summary || "独立复核已完成。").slice(0, 800),
        findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 20) : [],
      };
    }

    const reviewerPassed = reviewer.status === "passed" && !reviewer.findings.some((finding) => String((finding as Record<string, unknown>)?.severity) === "error");
    const factsPassed = applied.findings.length === 0 && facts.ok;
    const artifact = await createArtifactWithClaims({
      userId: user.id,
      opportunityId,
      artifactType: "target_resume",
      title: "用户修改后的岗位简历",
      content: { baseResumeText: resumeText, jobDescription, changes, previewText: applied.text },
      status: factsPassed && reviewerPassed && ats.ok ? "needs_confirmation" : "draft",
      contextSnapshot: context,
      createdBy: "user",
      claimLinks: activeChanges.flatMap((change, index) => (change.evidenceIds || (change.evidenceId ? [change.evidenceId] : [])).map((claimId) => ({ claimId, usagePath: `changes.${index}.after` }))),
    });

    const reviews = await Promise.all([
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "facts", status: factsPassed ? "passed" : "failed", summary: factsPassed ? "用户修改后的表述均关联已确认事实。" : "存在无法定位、未确认或数字不一致的内容。", findings: [...applied.findings, ...facts.issues], contextFingerprint: context.fingerprint }),
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "independent_ai", status: reviewerPassed ? "passed" : "failed", summary: reviewer.summary, findings: reviewer.findings, contextFingerprint: context.fingerprint }),
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "ats", status: ats.ok ? "passed" : "failed", summary: ats.ok ? `文本可解析；岗位词覆盖 ${(ats.coverage * 100).toFixed(0)}%。` : "文本不满足 ATS 基础要求。", findings: ats.findings, contextFingerprint: context.fingerprint }),
      recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "pdf", status: "not_run", summary: "导出 PDF 后上传校验文字层。", findings: [], contextFingerprint: context.fingerprint }),
    ]);

    return NextResponse.json({
      ok: true,
      changes,
      previewText: applied.text,
      applicationQuality: {
        artifactId: String(artifact.id),
        version: Number(artifact.version),
        status: factsPassed && reviewerPassed && ats.ok ? "ready" : "blocked",
        reviews: reviews.map((review) => ({ reviewerType: review.reviewer_type, status: review.status, summary: review.summary })),
      },
    });
  } catch (error) {
    console.error("Resume user edit review failed", error);
    if (error instanceof ContextBudgetExceededError) {
      return NextResponse.json({ ok: false, error: error.message, blocked: error.blocked }, { status: 422 });
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "简历修改检查失败" }, { status: 500 });
  }
}
