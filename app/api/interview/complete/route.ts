/**
 * POST /api/interview/complete
 * 完成面试会话并生成总结
 * 
 * - 读取题目、回答和评价，生成 questionBreakdown + nextActions
 * - 写入当前岗位的 interview_feedback snapshot（幂等）
 * - 缺少真实回答时拒绝总结
 */

export const runtime = "nodejs";
export const preferredRegion = "iad1";

import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { summarizeInterview, type AssessmentLike } from "@/lib/interview/llm";
import type { RoundType } from "@/lib/interview/types";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import {
  ContextBudgetExceededError,
  compileContextBundle,
  renderContextForPrompt,
} from "@/lib/coach-harness";
import {
  acquireInterviewGenerationClaim,
  completeInterviewGenerationClaim,
  releaseInterviewGenerationClaim,
} from "@/lib/interview-generation-claims";

/** 总结预算：评估列表是核心载荷不进预算；JD 作为对照材料可降级。 */
const SUMMARY_BUDGET = 8_000;

interface CompleteRequest {
  session_id: string;
  opportunityId?: string;
}

export async function POST(request: Request) {
  try {
    // 1. 鉴权
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return new Response(
        JSON.stringify({ ok: false, error: "未认证" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    const userId = auth.id;

    // 2. 解析请求体
    let body: CompleteRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "无效的 JSON 请求体" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. 验证请求参数
    const { session_id, opportunityId } = body;
    if (!session_id || typeof session_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 session_id 字段" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. 获取数据库客户端
    const db = await getDbClient();
    if (!db) {
      return new Response(
        JSON.stringify({ ok: false, error: "数据库连接失败" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. 验证会话是否存在且属于当前用户
    const { data: session, error: sessionError } = await db
      .from("interview_sessions")
      .select("id, user_id, round_type, jd, opportunity_id")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ ok: false, error: "面试会话不存在" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (session.user_id !== userId) {
      return new Response(
        JSON.stringify({ ok: false, error: "无权访问此面试会话" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (session.opportunity_id && opportunityId && session.opportunity_id !== opportunityId) {
      return new Response(
        JSON.stringify({ ok: false, error: "岗位与当前面试会话不一致" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }
    const effectiveOpportunityId = session.opportunity_id || opportunityId;
    let opportunityMetadata: Record<string, unknown> | null = null;
    if (effectiveOpportunityId) {
      const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
        .select("id, metadata")
        .eq("id", effectiveOpportunityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (opportunityError) throw opportunityError;
      if (!opportunity) {
        return new Response(JSON.stringify({ ok: false, error: "岗位不存在" }), {
          status: 404, headers: { "Content-Type": "application/json" },
        });
      }
      opportunityMetadata = opportunity.metadata && typeof opportunity.metadata === "object"
        ? opportunity.metadata as Record<string, unknown>
        : {};
    }

    // 6. 查询该会话的所有题目和答案
    const { data: questions, error: questionsError } = await db
      .from("interview_questions")
      .select("id, question_text")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    if (questionsError) {
      console.error("查询题目失败:", questionsError);
      return new Response(
        JSON.stringify({ ok: false, error: "查询题目失败" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: answers, error: answersError } = await db
      .from("interview_answers")
      .select("question_id, answer, assessment")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    if (answersError) {
      console.error("查询答案失败:", answersError);
      return new Response(
        JSON.stringify({ ok: false, error: "查询答案失败" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!answers || answers.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "该会话还没有任何答案，无法生成总结" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. 提取评估结果，过滤掉低信息回答（needs_more_input）
    const assessments = answers
      .map((a: { assessment?: Record<string, unknown> | null; question_id?: string }) => ({
        ...(a.assessment || a),
        questionId: a.question_id,
      }))
      .filter((a: { status?: unknown }) => !!a && typeof a === "object" && a.status !== "needs_more_input") as AssessmentLike[];

    if (assessments.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "所有回答均为低信息回答，缺少可评分的答题数据，无法生成总结" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 8. 幂等性检查
    const claimKey = `summary:${session_id}`;
    const claim = await acquireInterviewGenerationClaim({
      key: claimKey,
      userId,
      sessionId: session_id,
      operation: "session_summary",
    });
    if (claim.state === "processing") {
      return new Response(JSON.stringify({ ok: false, error: "总结正在生成，请稍后重试" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (claim.state === "completed") {
      return new Response(JSON.stringify(claim.result), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-yi-zhi-idempotent-replay": "true" },
      });
    }

    try {
      // 9. 生成面试总结（LLM 失败时抛出错误，不静默降级）
      // M4：JD 走 ContextBundle 预算（可降级，评估列表才是核心载荷）。
      // 总结主要消费各题评估，JD 只是对照材料，装不下不阻塞总结。
      const context = compileContextBundle({
        task: "interview_review",
        userId,
        claims: [],
        attachments: [
          { id: "interview-jd", label: "岗位 JD", text: String(session.jd || ""), required: false },
        ],
        budget: { maxInputTokens: SUMMARY_BUDGET },
      });
      const rendered = renderContextForPrompt(context);
      const summary = await runWithGenerationContext({
        userId,
        operation: "mock_interview_summary",
        requestId: claimKey,
      }, () => summarizeInterview({
        jd: session.jd,
        roundType: session.round_type as RoundType,
        assessments: assessments,
        questions: questions || undefined,
        contextText: rendered.text,
        warnings: rendered.warnings,
      }));

      // 10. 写入 interview_feedback snapshot（幂等）
      let snapshotId: string | null = null;
      if (effectiveOpportunityId) {
        const snapshot = await createOpportunitySnapshot({
          userId,
          opportunityId: effectiveOpportunityId,
          snapshotType: "interview_feedback",
          title: `模拟面试总结 · ${session.round_type} · ${new Date().toLocaleDateString("zh-CN")}`,
          content: {
            sessionId: session_id,
            roundType: session.round_type,
            overallScore: summary.overallScore,
            grade: summary.grade,
            verdict: summary.verdict,
            strengths: summary.strengths,
            weaknesses: summary.weaknesses,
            suggestions: summary.suggestions,
            dimensions: summary.dimensions,
            questionBreakdown: summary.questionBreakdown,
            nextActions: summary.nextActions,
            totalQuestions: questions?.length || 0,
            answeredQuestions: answers.length,
            lowInfoAnswers: answers.length - assessments.length,
          },
          createdBy: "hosted_ai",
          metadata: {
            mode: "mock_interview_summary",
            sessionId: session_id,
            roundType: session.round_type,
          },
        });
        snapshotId = String(snapshot.id || "");

        // 10b. 将 nextActions 同步到 opportunity metadata.actions
        const currentMeta = opportunityMetadata || {};
        const currentActions: Array<{ id?: string; [key: string]: unknown }> = Array.isArray(currentMeta.actions)
          ? currentMeta.actions
          : [];
        const newActions = summary.nextActions.map((na) => ({
          id: `interview-next-${session_id}-${na.title.slice(0, 32)}`,
          title: na.title,
          reason: na.reason,
          dueLabel: na.doneWhen,
          priority: na.priority,
          status: "todo" as const,
        }));
        const existingIds = new Set(currentActions.map((a) => a.id));
        const deduped = newActions.filter((a) => !existingIds.has(a.id));
        if (deduped.length > 0) {
          const updatedMeta = { ...currentMeta, actions: [...currentActions, ...deduped] };
          const { error: actionError } = await db.from("coach_opportunities")
            .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
            .eq("id", effectiveOpportunityId)
            .eq("user_id", userId);
          if (actionError) {
            throw new Error(`同步下一步行动失败：${actionError.message}`);
          }
        }
      }

      // 11. 构建响应
      const responseWithPayload = {
        type: "session-summary",
        payload: {
          session_id: session_id,
          summary: summary,
        },
        meta: {
          source: "llm",
          generated_at: new Date().toISOString(),
          snapshot_id: snapshotId,
        },
      };

      await completeInterviewGenerationClaim(claimKey, userId, responseWithPayload);

      return new Response(JSON.stringify(responseWithPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      await releaseInterviewGenerationClaim(claimKey, userId).catch((releaseError) => {
        console.error("Release interview summary claim failed", releaseError);
      });
      throw error;
    }
  } catch (error) {
    console.error("API Error:", error);
    // 预算溢出可由用户决策恢复：换更短 JD。走 422 而不是 500。
    if (error instanceof ContextBudgetExceededError) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message, blocked: error.blocked }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "服务器内部错误",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
