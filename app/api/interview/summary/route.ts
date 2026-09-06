/**
 * GET /api/interview/summary?session_id=xxx
 * 查看整轮面试总结
 * 
 * 返回 InterviewSummaryResponse 格式，包含 questionBreakdown 和 nextActions
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { summarizeInterview, type AssessmentLike } from "@/lib/interview/llm";
import type {
  InterviewSummaryResponse,
  RoundType,
} from "@/lib/interview/types";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import {
  ContextBudgetExceededError,
  compileContextBundle,
  renderContextForPrompt,
} from "@/lib/coach-harness";

/** 与 complete route 一致：评估列表是核心载荷；JD 可降级。 */
const SUMMARY_BUDGET = 8_000;

export async function GET(request: Request) {
  try {
    // 1. 鉴权
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "未认证" },
        { status: 401 }
      );
    }

    // 2. 获取查询参数
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");

    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "缺少或无效的 session_id 查询参数" },
        { status: 400 }
      );
    }

    // 3. 获取数据库客户端
    const db = await getDbClient();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "数据库连接失败" },
        { status: 500 }
      );
    }

    // 4. 验证会话是否存在且属于当前用户
    const { data: session, error: sessionError } = await db
      .from("interview_sessions")
      .select("id, user_id, jd, round_type")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { ok: false, error: "面试会话不存在" },
        { status: 404 }
      );
    }

    if (session.user_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "无权访问此面试会话" },
        { status: 403 }
      );
    }

    // 5. 获取所有题目
    const { data: questions } = await db
      .from("interview_questions")
      .select("id, question_text")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    // 6. 获取所有答案和评估
    const { data: answers, error: answersError } = await db
      .from("interview_answers")
      .select("question_id, assessment")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    if (answersError) {
      console.error("获取答案失败:", answersError);
      return NextResponse.json(
        { ok: false, error: "获取答案失败" },
        { status: 500 }
      );
    }

    // 6. 过滤掉低信息回答（needs_more_input）
    if (!answers || answers.length === 0) {
      return NextResponse.json(
        { ok: false, error: "该面试会话还没有答案，无法生成总结" },
        { status: 400 }
      );
    }

    const assessments = answers
      .map((a: { assessment?: Record<string, unknown> | null; question_id?: string }) => ({
        ...(a.assessment || {}),
        questionId: a.question_id,
      }))
      .filter((a: { status?: unknown }) => a != null && a.status !== "needs_more_input") as AssessmentLike[];

    if (assessments.length === 0) {
      return NextResponse.json(
        { ok: false, error: "所有回答均为低信息回答，缺少可评分的答题数据，无法生成总结" },
        { status: 400 }
      );
    }

    // 7. 调用 LLM 生成总结（JD 走 ContextBundle 预算，可降级）
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
    const summary = await summarizeInterview({
      jd: session.jd,
      roundType: session.round_type as RoundType,
      assessments: assessments,
      questions: questions || undefined,
      contextText: rendered.text,
      warnings: rendered.warnings,
    });

    // 8. 返回响应
    const response: InterviewSummaryResponse = {
      session_id: session_id,
      overallScore: summary.overallScore,
      grade: summary.grade,
      gradeNext: summary.gradeNext,
      strengths: summary.strengths,
      weaknesses: summary.weaknesses,
      suggestions: summary.suggestions,
      dimensions: summary.dimensions,
      questionBreakdown: summary.questionBreakdown,
      nextActions: summary.nextActions,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("API Error:", error);
    if (error instanceof ContextBudgetExceededError) {
      return NextResponse.json({ ok: false, error: error.message, blocked: error.blocked }, { status: 422 });
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "服务器内部错误",
      },
      { status: 500 }
    );
  }
}
