/**
 * POST /api/interview/answer
 * 提交答案并获得评价
 * 
 * - 低信息回答：保存原回答，返回 needs_more_input，不推进题号
 * - 正常回答：调用 LLM 评估，返回 InterviewAssessment
 * - LLM 失败：抛出错误，不静默降级
 */

export const runtime = "nodejs";
export const preferredRegion = "iad1";

import { getDbClient, getLatestResumeByUserId } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { evaluateAnswer, formatResumeForPrompt } from "@/lib/interview/llm";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import {
  ContextBudgetExceededError,
  assertContextFits,
  compileContextBundle,
  renderContextForPrompt,
} from "@/lib/coach-harness";
import {
  acquireInterviewGenerationClaim,
  completeInterviewGenerationClaim,
  releaseInterviewGenerationClaim,
} from "@/lib/interview-generation-claims";
import { detectAnswerGap, buildNeedsMoreInputAssessment } from "@/lib/interview/low-info-detector";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import type {
  AnswerQuestionRequest,
  AnswerQuestionResponse,
  RoundType,
} from "@/lib/interview/types";

/** 答题评估预算：JD 必须读到，简历/知识可降级。 */
const ANSWER_BUDGET = 12_000;

function toKnowledgeItems(items: Array<Record<string, unknown>>) {
  return items.map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    title: String(item.title || "知识片段"),
    description: String(item.description || ""),
    goal: String(item.goal || ""),
    scope: String(item.scope || ""),
    confidence: (["low", "medium", "high"].includes(String(item.confidence)) ? String(item.confidence) : "medium") as "low" | "medium" | "high",
    evidenceUrls: (Array.isArray(item.evidence) ? item.evidence : []).map((source) => String((source as Record<string, unknown>)?.url || "")).filter(Boolean),
  }));
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
    let body: AnswerQuestionRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "无效的 JSON 请求体" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. 验证请求参数
    const { session_id, question_id, answer, opportunityId } = body;
    if (!session_id || typeof session_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 session_id 字段" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!question_id || typeof question_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 question_id 字段" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "缺少或无效的 answer 字段" }),
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

    // 6. 验证题目是否存在且属于此会话
    const { data: question, error: questionError } = await db
      .from("interview_questions")
      .select("id, question_text")
      .eq("id", question_id)
      .eq("session_id", session_id)
      .single();

    if (questionError || !question) {
      return new Response(
        JSON.stringify({ ok: false, error: "题目不存在或不属于此会话" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (session.opportunity_id && opportunityId && session.opportunity_id !== opportunityId) {
      return new Response(
        JSON.stringify({ ok: false, error: "岗位与当前面试会话不一致" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }
    const effectiveOpportunityId = session.opportunity_id || opportunityId;
    let urgent = false;
    if (effectiveOpportunityId) {
      const { data: opportunity, error: opportunityError } = await db.from("coach_opportunities")
        .select("id, scheduled_interview_at").eq("id", effectiveOpportunityId).eq("user_id", userId).maybeSingle();
      if (opportunityError) throw opportunityError;
      if (!opportunity) {
        return new Response(JSON.stringify({ ok: false, error: "岗位不存在" }), {
          status: 404, headers: { "Content-Type": "application/json" },
        });
      }
      const scheduledAt = opportunity.scheduled_interview_at ? new Date(String(opportunity.scheduled_interview_at)).getTime() : null;
      if (scheduledAt !== null && Number.isFinite(scheduledAt)) {
        urgent = scheduledAt - Date.now() <= 48 * 60 * 60 * 1000;
      }
    }

    const answerFingerprint = createHash("sha256")
      .update(answer.trim().replace(/\s+/g, " "))
      .digest("hex")
      .slice(0, 24);
    const claimKey = `answer:${session_id}:${question_id}:${answerFingerprint}`;
    const claim = await acquireInterviewGenerationClaim({
      key: claimKey,
      userId,
      sessionId: session_id,
      operation: "answer_assessment",
    });
    if (claim.state === "processing") {
      return new Response(JSON.stringify({ ok: false, error: "这道题正在生成反馈，请稍后重试" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (claim.state === "completed") {
      return new Response(JSON.stringify({ question_id, assessment: claim.result }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-yi-zhi-idempotent-replay": "true" },
      });
    }

    // 7. 回答缺口检测：短但准确的回答不再被机械拦下（PRD 验收场景 4）
    const gapResult = detectAnswerGap(answer.trim());
    if (gapResult.isLowInfo) {
      // 面试临近时压缩讲解：允许跳过，但如实记录。PRD §4.2
      const assessment = buildNeedsMoreInputAssessment(gapResult.reason || "unknown", { urgent });

      // 保存低信息回答（保存但不评分）
      const answerId = uuidv4();
      try {
        const { error: insertError } = await db
          .from("interview_answers")
          .insert({
            id: answerId,
            session_id: session_id,
            question_id: question_id,
            answer: answer.trim(),
            assessment: assessment,
            created_at: new Date().toISOString(),
          });
        if (insertError) throw insertError;
        await completeInterviewGenerationClaim(claimKey, userId, assessment);
      } catch (insertErr) {
        await releaseInterviewGenerationClaim(claimKey, userId).catch((releaseError) => {
          console.error("Release low-info answer claim failed", releaseError);
        });
        throw insertErr;
      }

      // 返回 needs_more_input，不推进题号
      const response: AnswerQuestionResponse = {
        question_id: question_id,
        assessment: assessment,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 8. 查询用户简历数据
    let resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    try {
      if (!resumeText) {
        const resume = await getLatestResumeByUserId(userId);
        if (resume?.parsed) resumeText = formatResumeForPrompt(resume.parsed);
      }
    } catch (err) {
      console.warn("查询简历数据失败（非关键错误）:", err);
    }

    const knowledge = await buildAgentKnowledgeContext({
      task: "answer_assessment",
      query: `${session.round_type} ${question.question_text} ${session.jd.slice(0, 180)}`,
      limit: 5,
    });

    // M4：JD / 简历 / 知识纳入 ContextBundle 预算；题目和回答走 required 槽位
    // 单独计价。评估 prompt 自己有「面试问题 / 候选人回答」抬头，渲染时用
    // excludeKinds 去掉重复。JD 缺了评估就失去对照基准 → required。
    const context = compileContextBundle({
      task: "mock_interview",
      userId,
      claims: [],
      knowledge: toKnowledgeItems(knowledge.items as unknown as Array<Record<string, unknown>>),
      questionSource: { id: question_id, text: question.question_text },
      currentInput: answer.trim(),
      attachments: [
        { id: "interview-jd", label: "岗位 JD", text: String(session.jd || ""), required: true },
        { id: "resume-text", label: "候选人简历", text: resumeText, required: false },
      ],
      budget: { maxInputTokens: ANSWER_BUDGET },
    });
    assertContextFits(context);
    const rendered = renderContextForPrompt(context, {
      excludeKinds: ["question_source", "current_input"],
    });

    try {
      // 10. 评估答案（LLM 失败时抛出错误，不静默降级）
      const assessment = await runWithGenerationContext({
        userId,
        operation: "mock_interview_answer_assessment",
        requestId: claimKey,
        knowledgeDocumentIds: knowledge.items.map((item) => item.id),
      }, () => evaluateAnswer({
        question: question.question_text,
        jd: session.jd,
        answer: answer.trim(),
        roundType: session.round_type as RoundType,
        resumeText: resumeText || undefined,
        knowledgeContext: knowledge.contextText || undefined,
        contextText: rendered.text,
        warnings: rendered.warnings,
      }));

      // 11. 保存答案和评估到数据库
      const answerId = uuidv4();
      const { error: answerError } = await db
        .from("interview_answers")
        .insert({
          id: answerId,
          session_id: session_id,
          question_id: question_id,
          answer: answer.trim(),
          assessment: assessment,
          created_at: new Date().toISOString(),
        });

      if (answerError) throw new Error(`保存答案失败：${answerError.message}`);
      await completeInterviewGenerationClaim(claimKey, userId, assessment);

      // 12. 返回响应
      const response: AnswerQuestionResponse = {
        question_id: question_id,
        assessment: assessment,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      await releaseInterviewGenerationClaim(claimKey, userId).catch((releaseError) => {
        console.error("Release interview answer claim failed", releaseError);
      });
      throw error;
    }
  } catch (error) {
    console.error("API Error:", error);
    // 预算溢出可由用户决策恢复：换更短 JD / 去掉简历。走 422 而不是 500。
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
