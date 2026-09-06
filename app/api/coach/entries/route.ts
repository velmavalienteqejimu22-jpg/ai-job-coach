import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  GOAL_LABELS,
  GOAL_TYPES,
  getCurrentPlan,
  getPlanHistory,
  switchPlan,
  type GoalType,
} from "@/lib/coach-harness/plans";

export const runtime = "nodejs";

/**
 * 四类目的入口（PRD §3.1 / §8 M1）。
 *
 * GET：返回四类入口的可用性与当前计划——首访界面据此渲染快捷入口。
 *   四类入口永远可用（谈薪不需要 JD/简历/第一课，从零学不需要任何材料）。
 * POST {goalType, opportunityId?}：聚焦对应计划，返回首个待办任务。
 *   切换不是永久身份，可随时再切；同目标+同岗位的旧计划会被复用（任务进度保留），
 *   其他计划保持 active 不受影响——多岗位并行（PRD §3.2）。
 */

function describeEntries(activeGoal: GoalType | null) {
  return GOAL_TYPES.map((goalType) => ({
    goalType,
    label: GOAL_LABELS[goalType],
    active: goalType === activeGoal,
    // PRD §3.1：四类入口都不设前置材料；无实际实现的动作明确不可用——
    // 这里四类都有真实交付，所以 availability 全部为 true。
    available: true,
    firstOutcome: {
      learn_from_zero: "完成第一课的判断练习并保存",
      prepare_apply: "明确岗位筛选条件，可选一次岗位比较",
      interviewing: "产出真实练习反馈或提问清单",
      negotiating: "梳理 offer 条款并生成沟通草稿",
    }[goalType],
  }));
}

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const activePlan = await getCurrentPlan(user.id);
    const history = await getPlanHistory(user.id);
    return NextResponse.json({
      ok: true,
      entries: describeEntries(activePlan?.goalType ?? null),
      activePlan,
      history: history.map((plan) => ({
        id: plan.id,
        goalType: plan.goalType,
        // 前端点选计划时带回岗位 ID——入口请求必须带岗位才能落到正确计划（不串岗位）
        opportunityId: plan.opportunityId,
        status: plan.status,
        version: plan.version,
        taskCount: plan.tasks.length,
        doneCount: plan.tasks.filter((t) => t.status === "done").length,
        updatedAt: plan.updatedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "读取计划失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let body: { goalType?: string; opportunityId?: string; opportunityLabel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const goalType = body?.goalType as GoalType;
  if (!GOAL_TYPES.includes(goalType)) {
    return NextResponse.json({ ok: false, error: "无效的入口类型" }, { status: 400 });
  }
  try {
    const { plan, reactivated } = await switchPlan({
      userId: user.id,
      goalType,
      opportunityId: body.opportunityId || null,
      opportunityLabel: body.opportunityLabel || null,
    });
    const nextTask = plan.tasks.find((task) => task.status === "todo" || task.status === "in_progress") ?? null;
    return NextResponse.json({
      ok: true,
      plan,
      reactivated,
      nextTask,
      // 每个入口对应的落地动作，前端据此路由（PRD §4.1：首页主操作由用户目的决定）
      landingAction: {
        learn_from_zero: "open_first_lesson",
        prepare_apply: "open_position_screening",
        interviewing: "open_interview_practice",
        negotiating: "open_offer_terms",
      }[goalType],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "切换计划失败" },
      { status: 500 },
    );
  }
}
