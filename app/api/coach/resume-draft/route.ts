import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  ContextBudgetExceededError,
  applyResumeChanges,
  assertContextFits,
  compileContextBundle,
  renderCitableFactsForPrompt,
  reviewAtsText,
  validateArtifactDraft,
  type CareerClaim,
} from "@/lib/coach-harness";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";
import { callLLM } from "@/lib/llm";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";
import { runWithGenerationContext } from "@/lib/generation-context";
import type { ResumeChange } from "@/lib/opportunities/types";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

function parseJson(text: string) {
  const match = text.replace(/```json\s*/g, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回格式错误");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let reservation: QuotaReservation | null = null;
  try {
    const body = await request.json();
    const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
    const opportunityId = String(body.opportunityId || "").trim();
    if (!resumeText || !jobDescription) return NextResponse.json({ ok: false, error: "请先补充简历和 JD" }, { status: 400 });
    const requestId = String(body.requestId || crypto.randomUUID()).slice(0, 180);
    reservation = await reserveQuota(user.id, "resume", `resume-draft:${requestId}`);
    if (!reservation) return NextResponse.json({ ok: false, error: "简历生成额度不足", needUpgrade: true }, { status: 403 });

    // 简历改写要读完整简历 + JD，single_inference 的 2k 装不下。
    // 预算必须显式给，否则 Compiler 会按默认值把简历大半丢掉——之前那条
    // .slice(0, 160) 的手搓截断掩盖了这个问题，让 budget 形同虚设。
    const RESUME_WORKSHOP_BUDGET = 12_000;

    // JD 走 questionSource 而不是直接拼进 user message：
    // 它是本次改写必须完整读到的原文，纳入 budget 后装不下会被 fail-loud 拦住，
    // 而不是像以前那样 3 万字 JD 无声地塞进 prompt。
    const questionSource = { id: "job-description", text: jobDescription };

    let context;
    if (opportunityId) {
      context = await getContextBundleForUser({
        userId: user.id,
        task: "resume_workshop",
        opportunityId,
        questionSource,
        budget: { maxInputTokens: RESUME_WORKSHOP_BUDGET },
      });
    } else {
      const lines = resumeText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 120);
      // PRD §5.2：粘贴进来的简历行是用户材料，不是用户逐条确认过的事实。
      // 以前这里直接标 confirmed，等于把「我上传过」包装成「我确认过」。
      const claims: CareerClaim[] = lines.map((line, index) => ({
        id: `resume-line-${index + 1}`, entityType: "experience", entityKey: `resume-line-${index + 1}`,
        claimType: "resume_source", value: line, displayText: line, sourceExcerpt: line,
        status: "unverified", visibility: "recruiter_safe",
        sourceKind: "user_upload", verificationLevel: "self_reported",
      }));
      context = compileContextBundle({
        task: "resume_workshop",
        userId: user.id,
        claims,
        questionSource,
        budget: { maxInputTokens: RESUME_WORKSHOP_BUDGET },
      });
    }

    // PRD §5.1 fail-loud：关键原句装不下就拒绝生成，不能截断后继续作结论。
    assertContextFits(context);

    // 可引用 = 来源可引用且状态可用。未逐条确认的仍可用，只是会带上口径提醒。
    // 用渲染器而不是手搓 filter+slice：只有被 Compiler 装进 selection 的事实才能进 prompt，
    // 被预算舍弃的不会在这儿被捞回来。
    const rendered = renderCitableFactsForPrompt(context);
    const citableIds = new Set([...context.allowedClaimIds, ...context.unverifiedClaimIds]);
    const source = rendered.text;
    if (!source) throw new Error("事实库里没有可用于简历的真实材料，请先补充简历或经历");

    const output = await runWithGenerationContext({
      userId: user.id,
      operation: "resume_draft",
      requestId,
    }, () => callLLM([
      { role: "system", content: `你是益职的岗位简历编辑器。只改写用户已经提供的事实，不补项目、职责、技能、数字或时间。每条建议必须引用能完整支持它的 sourceIds。若证据不够就不要生成。只返回 JSON：{"changes":[{"section":"经历位置","before":"原文原句","after":"可直接使用的新表述","reason":"与 JD 的具体对应","sourceIds":["resume-line-1"]}]}` },
      { role: "user", content: `目标 JD：\n${jobDescription}\n\n带编号的简历事实：\n${source}\n\n最多给出 6 条高价值修改。before 必须来自原文。` },
    ], { provider: "deepseek", temperature: 0.15, maxTokens: 2600, timeoutMs: 45_000, maxRetries: 1, responseFormat: "json_object" }));

    const parsed = parseJson(output);
    const rawChanges = Array.isArray(parsed.changes) ? parsed.changes.slice(0, 6) : [];
    const rejected: Array<{ index: number; reasons: string[] }> = [];
    const changes: ResumeChange[] = rawChanges.flatMap((raw: Record<string, unknown>, index: number) => {
      const sourceIds = Array.isArray(raw.sourceIds) ? raw.sourceIds.map(String).filter((id) => citableIds.has(id)) : [];
      const after = String(raw.after || "").trim().slice(0, 2000);
      const before = String(raw.before || "").trim().slice(0, 2000);
      const report = validateArtifactDraft({ artifactType: "target_resume", visibility: "recruiter_safe", sections: [{ path: `changes.${index}.after`, content: after, claimIds: sourceIds }] }, context);
      if (!after || !before || !report.ok) {
        rejected.push({ index, reasons: report.issues.map((issue) => issue.message) });
        return [];
      }
      return [{
        id: `ai-change-${Date.now()}-${index}`,
        section: String(raw.section || "经历表述").slice(0, 100),
        before,
        after,
        reason: String(raw.reason || "提高与 JD 的对应度").slice(0, 500),
        evidenceId: sourceIds[0] || null,
        evidenceIds: sourceIds,
        status: "pending" as const,
      }];
    });
    if (!changes.length) {
      await finalizeQuota(reservation, false);
      reservation = null;
      return NextResponse.json({ ok: false, error: "没有生成通过事实校验的修改，请补充更完整的经历；本次未扣额度" }, { status: 422 });
    }
    const reviewerOutput = await callLLM([
      { role: "system", content: `你是独立的简历质检员，不参与起草。检查每条修改是否：1. 被 sourceIds 完整支持；2. 没扩大职责、结果、技能或数字；3. before 确实来自原简历；4. 对目标 JD 有明确价值。只返回 JSON：{"status":"passed|failed","summary":"一句话","findings":[{"changeId":"...","severity":"warning|error","message":"..."}]}` },
      { role: "user", content: `目标 JD：\n${jobDescription}\n\n原简历：\n${resumeText}\n\n事实源：\n${source}\n\n待审修改：\n${JSON.stringify(changes)}` },
    ], { provider: "deepseek", temperature: 0, maxTokens: 1800, timeoutMs: 45_000, maxRetries: 1, responseFormat: "json_object" });
    const reviewer = parseJson(reviewerOutput) as { status?: string; summary?: string; findings?: unknown[] };
    const reviewerFindings = Array.isArray(reviewer.findings) ? reviewer.findings.slice(0, 20) : [];
    const reviewerPassed = reviewer.status === "passed" && !reviewerFindings.some((finding) => String((finding as Record<string, unknown>)?.severity) === "error");
    const preview = applyResumeChanges(resumeText, changes);
    const ats = reviewAtsText(preview.text, jobDescription);
    let applicationQuality;
    if (opportunityId) {
      const claimLinks = changes.flatMap((change, index) => (change.evidenceIds || (change.evidenceId ? [change.evidenceId] : [])).map((claimId) => ({ claimId, usagePath: `changes.${index}.after` })));
      const artifact = await createArtifactWithClaims({
        userId: user.id, opportunityId, artifactType: "target_resume", title: "岗位简历候选版本",
        content: { baseResumeText: resumeText, jobDescription, changes, previewText: preview.text },
        status: reviewerPassed && ats.ok ? "needs_confirmation" : "draft", contextSnapshot: context,
        createdBy: "hosted_ai", claimLinks,
      });
      const factsStatus = rejected.length === 0 && preview.findings.length === 0 ? "passed" : "failed";
      const reviews = await Promise.all([
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "facts", status: factsStatus, summary: factsStatus === "passed" ? "所有改写均可追溯到已确认事实。" : "存在无法定位或未通过事实校验的改写。", findings: [...rejected, ...preview.findings], contextFingerprint: context.fingerprint }),
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "independent_ai", status: reviewerPassed ? "passed" : "failed", summary: String(reviewer.summary || (reviewerPassed ? "独立复核通过。" : "独立复核发现阻断项。")), findings: reviewerFindings, contextFingerprint: context.fingerprint }),
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "ats", status: ats.ok ? "passed" : "failed", summary: ats.ok ? `文本可解析；岗位词覆盖 ${(ats.coverage * 100).toFixed(0)}%。` : "文本不满足 ATS 基础要求。", findings: ats.findings, contextFingerprint: context.fingerprint }),
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "pdf", status: "not_run", summary: "导出 PDF 后上传校验文字层。", findings: [], contextFingerprint: context.fingerprint }),
      ]);
      applicationQuality = {
        artifactId: String(artifact.id), version: Number(artifact.version),
        status: factsStatus === "passed" && reviewerPassed && ats.ok ? "ready" : "blocked",
        reviews: reviews.map((review) => ({ reviewerType: review.reviewer_type, status: review.status, summary: review.summary })),
      };
    }
    await finalizeQuota(reservation, true);
    const quota = { source: reservation.source, remaining: reservation.remaining };
    reservation = null;
    return NextResponse.json({
      ok: true,
      changes,
      rejectedCount: rejected.length,
      reviewer: { passed: reviewerPassed, summary: reviewer.summary, findings: reviewerFindings },
      applicationQuality,
      contextFingerprint: context.fingerprint,
      context: {
        usedTokens: rendered.usedTokens,
        budget: context.budget.maxInputTokens,
        included: context.selection.included.length,
        excluded: context.selection.excluded.length,
        warnings: rendered.warnings,
      },
      quota,
    });
  } catch (error) {
    if (reservation) await finalizeQuota(reservation, false).catch((refundError) => console.error("Resume quota refund failed", refundError));
    console.error("Resume draft failed", error);
    // 预算溢出是可由用户决策恢复的：拆任务、删材料或换更短的 JD。
    // 走 422 而不是 500，并把被拦下的条目回传，让前端能给出具体选项。
    if (error instanceof ContextBudgetExceededError) {
      return NextResponse.json({ ok: false, error: error.message, blocked: error.blocked }, { status: 422 });
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "简历生成失败" }, { status: 500 });
  }
}
