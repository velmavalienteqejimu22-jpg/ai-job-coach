/**
 * 动态路径：计划与 offer 条款的存储层（PRD §3.1/§3.2/§6.1）。
 *
 * 设计要点：
 * - 计划是「可修改的执行安排」，不是永久画像。切换入口 = 旧计划 paused + 新计划
 *   active；同 goal_type 的旧计划可被重新激活，任务和产物不丢（PRD §3.2）。
 * - 每用户最多一个 active 计划，由 DB 部分唯一索引兜底，代码层不靠先查后插。
 * - 所有查询带 owner 过滤（PRD §6.2）。
 */
import { getDbClient } from "@/lib/db";
import { assertUuid } from "./repository";

export type GoalType = "learn_from_zero" | "prepare_apply" | "interviewing" | "negotiating";

export type PlanTaskStatus = "todo" | "in_progress" | "done" | "skipped";

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: PlanTaskStatus;
  /** 为什么有这个任务（PRD §3.3：建议理由可见） */
  reason: string;
  entryType: GoalType;
  /** 任务完成时挂的产物 ID（PRD §4.2：完成态必须包含可找回的产物 ID） */
  artifactId?: string;
}

export interface CoachPlan {
  id: string;
  goalType: GoalType;
  opportunityId: string | null;
  version: number;
  status: "active" | "paused" | "completed" | "cancelled";
  tasks: PlanTask[];
  revisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferTerms {
  currency?: string | null;
  payCycle?: "monthly" | "annual" | null;
  grossOrNet?: "gross" | "net" | "unknown" | null;
  base?: number | null;
  bonus?: number | null;
  equity?: string | null;
  termMonths?: number | null;
  probation?: string | null;
  deadline?: string | null;
  source?: string | null;
  /** 用户还没确认的缺项——如实展示未知，不猜测（PRD §6.1） */
  unknowns: string[];
}

export interface CoachOffer {
  id: string;
  opportunityId: string;
  terms: OfferTerms;
  /** 个人取舍优先级，比如 ["现金", "成长空间"] */
  priorities: string[];
  status: "received" | "comparing" | "negotiating" | "accepted" | "declined" | "expired";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const GOAL_TYPES: GoalType[] = ["learn_from_zero", "prepare_apply", "interviewing", "negotiating"];

export const GOAL_LABELS: Record<GoalType, string> = {
  learn_from_zero: "从零学",
  prepare_apply: "准备投递",
  interviewing: "准备面试",
  negotiating: "谈薪",
};

/** 每类入口 seed 的首个任务（PRD §3.1 表：首次行动与首个成果） */
export function seedTaskForEntry(goalType: GoalType, opportunityLabel?: string): PlanTask {
  const now = new Date().toISOString();
  const suffix = now.slice(11, 19).replace(/:/g, "");
  switch (goalType) {
    case "learn_from_zero":
      return {
        id: `task-lesson1-${suffix}`,
        title: "第一课：拆解一个 AI 产品问题",
        description: "一个具体案例、一段短讲解、一个可完成的判断练习。结束留下你的首份产物和下一步。",
        status: "todo",
        reason: "你选择从零学。第一课不需要 JD 或简历。",
        entryType: goalType,
      };
    case "prepare_apply":
      return {
        id: `task-screen-${suffix}`,
        title: opportunityLabel ? `明确「${opportunityLabel}」的筛选条件` : "明确岗位筛选条件",
        description: "写下你在意的范围（方向/地点/规模），有候选岗位时做一次比较。原版简历会被保留，不会自动重写。",
        status: "todo",
        reason: "你选择准备投递。先定筛选条件，不默认改简历。",
        entryType: goalType,
      };
    case "interviewing":
      return {
        id: `task-pick-${suffix}`,
        title: "选一项本轮最值得准备的",
        description: "从公司/岗位/轮次里挑当前最缺的一项，产出真实练习反馈或提问清单。",
        status: "todo",
        reason: "你选择准备面试。不需要先完成任何课程。",
        entryType: goalType,
      };
    case "negotiating":
      return {
        id: `task-terms-${suffix}`,
        title: "梳理 offer 条款与个人取舍",
        description: "逐项录入条款（缺项如实记未知），写下你在意的优先级，生成谈判问题与沟通草稿。",
        status: "todo",
        reason: "你选择谈薪。不需要 JD、简历或第一课。",
        entryType: goalType,
      };
  }
}

function mapPlan(row: Record<string, unknown>): CoachPlan {
  return {
    id: String(row.id),
    goalType: row.goal_type as GoalType,
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
    version: Number(row.version ?? 1),
    status: row.status as CoachPlan["status"],
    tasks: Array.isArray(row.tasks) ? (row.tasks as PlanTask[]) : [],
    revisionReason: typeof row.revision_reason === "string" ? row.revision_reason : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapOffer(row: Record<string, unknown>): CoachOffer {
  const terms = (row.terms && typeof row.terms === "object" ? row.terms : {}) as Partial<OfferTerms>;
  return {
    id: String(row.id),
    opportunityId: String(row.opportunity_id),
    terms: { ...terms, unknowns: Array.isArray(terms.unknowns) ? terms.unknowns : [] },
    priorities: Array.isArray(row.priorities) ? (row.priorities as string[]) : [],
    status: row.status as CoachOffer["status"],
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function db() {
  const client = await getDbClient();
  if (!client) throw new Error("数据库不可用");
  return client;
}

/**
 * 当前计划：active 计划中 focused_at 最新的一个。
 * 注意：多计划可并行（PRD §3.2），这里返回的只是「当前聚焦」的那个，
 * 不代表其他 active 计划已停止。
 */
export async function getCurrentPlan(userId: string): Promise<CoachPlan | null> {
  assertUuid(userId, "userId");
  const client = await db();
  const { data, error } = await client.from("coach_plans")
    .select("*").eq("user_id", userId).eq("status", "active")
    .order("focused_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapPlan(data) : null;
}

export async function getPlanHistory(userId: string, limit = 10): Promise<CoachPlan[]> {
  assertUuid(userId, "userId");
  const client = await db();
  const { data, error } = await client.from("coach_plans")
    .select("*").eq("user_id", userId)
    .order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapPlan);
}

/** 按 ID 取计划（owner 过滤）。多标签场景：提交要回写到开课时的计划，不是当前聚焦的。 */
export async function getPlanById(userId: string, planId: string): Promise<CoachPlan | null> {
  assertUuid(userId, "userId");
  assertUuid(planId, "planId");
  const client = await db();
  const { data, error } = await client.from("coach_plans")
    .select("*").eq("id", planId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapPlan(data) : null;
}

/**
 * 切换入口：把「当前聚焦」切到目标类型对应的计划。
 *
 * - 同目标+同岗位的未完成计划被复用（active 或 paused 都行）——任务和进度保留；
 *   岗位不同绝不复用，避免把 A 岗位的任务带到 B 岗位。
 * - 不暂停、不改动其他计划：多个计划可同时 active（PRD §3.2 多岗位并行），
 *   切换只改变 focused_at（当前展示哪个）。
 */
export async function switchPlan(input: {
  userId: string;
  goalType: GoalType;
  opportunityId?: string | null;
  opportunityLabel?: string | null;
}): Promise<{ plan: CoachPlan; reactivated: boolean }> {
  assertUuid(input.userId, "userId");
  if (input.opportunityId) assertUuid(input.opportunityId, "opportunityId");
  const client = await db();

  // 1. 当前计划已是该目标+岗位 → 原样返回（不重复聚焦/新建）
  const current = await getCurrentPlan(input.userId);
  if (current && current.goalType === input.goalType
    && (current.opportunityId ?? null) === (input.opportunityId ?? null)) {
    return { plan: current, reactivated: true };
  }

  // 2. 找同目标+同岗位的最近未完成计划复用（岗位不同不复用——不串计划）
  let reusableQuery = client.from("coach_plans")
    .select("*").eq("user_id", input.userId).eq("goal_type", input.goalType)
    .in("status", ["active", "paused"]);
  reusableQuery = input.opportunityId
    ? reusableQuery.eq("opportunity_id", input.opportunityId)
    : reusableQuery.is("opportunity_id", null);
  const { data: reusable, error: reusableError } = await reusableQuery
    .order("focused_at", { ascending: false }).limit(1).maybeSingle();
  if (reusableError) throw reusableError;

  if (reusable) {
    const { data, error } = await client.from("coach_plans")
      .update({ status: "active", focused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", String(reusable.id)).eq("user_id", input.userId)
      .select("*").single();
    if (error) throw error;
    return { plan: mapPlan(data), reactivated: true };
  }

  // 3. 新建。其他计划保持 active 不受影响——「当前展示哪个」≠「其他计划停止」
  const { data, error } = await client.from("coach_plans")
    .insert({
      user_id: input.userId,
      goal_type: input.goalType,
      opportunity_id: input.opportunityId ?? null,
      status: "active",
      focused_at: new Date().toISOString(),
      tasks: [seedTaskForEntry(input.goalType, input.opportunityLabel ?? undefined)],
      revision_reason: `用户选择入口：${GOAL_LABELS[input.goalType]}`,
    })
    .select("*").single();
  if (error) throw error;
  return { plan: mapPlan(data), reactivated: false };
}

/** 更新任务列表。乐观锁：带 version 条件更新，并发冲突时抛错让调用方重读。 */
export async function updatePlanTasks(input: {
  userId: string;
  planId: string;
  tasks: PlanTask[];
  reason: string;
  expectedVersion: number;
}): Promise<CoachPlan> {
  assertUuid(input.userId, "userId");
  assertUuid(input.planId, "planId");
  const client = await db();
  const { data, error } = await client.from("coach_plans")
    .update({
      tasks: input.tasks,
      revision_reason: input.reason,
      version: input.expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.planId).eq("user_id", input.userId)
    .eq("version", input.expectedVersion)
    .select("*").single();
  if (error) throw new Error(`计划更新冲突：请刷新后重试（期望版本 ${input.expectedVersion}）`);
  return mapPlan(data);
}

export async function pausePlan(userId: string, planId: string, reason: string): Promise<CoachPlan> {
  assertUuid(userId, "userId");
  assertUuid(planId, "planId");
  const client = await db();
  const { data, error } = await client.from("coach_plans")
    .update({ status: "paused", revision_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", planId).eq("user_id", userId).eq("status", "active")
    .select("*").single();
  if (error) throw error;
  return mapPlan(data);
}

// ---------- offer 条款 ----------

/**
 * 无岗位场景（从零学/通用准备）的独立产物。coach_artifacts.opportunity_id 可空。
 * 产物类型固定 "other"，title 自描述——第一课等入口交付物从这里落库。
 */
export async function createStandaloneArtifact(input: {
  userId: string;
  title: string;
  content: unknown;
  status?: "draft" | "needs_confirmation" | "confirmed";
}): Promise<{ id: string; version: number }> {
  assertUuid(input.userId, "userId");
  const client = await db();
  const { data, error } = await client.from("coach_artifacts")
    .insert({
      user_id: input.userId,
      opportunity_id: null,
      artifact_type: "other",
      title: input.title,
      content: input.content,
      status: input.status ?? "draft",
      context_snapshot: { entry: "learn_from_zero" },
      created_by: "hosted_ai",
    })
    .select("id, version").single();
  if (error) throw error;
  return { id: String(data.id), version: Number(data.version) };
}

export async function listOffers(userId: string, opportunityId?: string): Promise<CoachOffer[]> {
  assertUuid(userId, "userId");
  const client = await db();
  let query = client.from("coach_offers").select("*").eq("user_id", userId);
  if (opportunityId) {
    assertUuid(opportunityId, "opportunityId");
    query = query.eq("opportunity_id", opportunityId);
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOffer);
}

export async function saveOffer(input: {
  userId: string;
  opportunityId: string;
  offerId?: string | null;
  terms: OfferTerms;
  priorities?: string[];
  status?: CoachOffer["status"];
  notes?: string | null;
}): Promise<CoachOffer> {
  assertUuid(input.userId, "userId");
  assertUuid(input.opportunityId, "opportunityId");
  const client = await db();
  const payload = {
    user_id: input.userId,
    opportunity_id: input.opportunityId,
    terms: input.terms,
    priorities: input.priorities ?? [],
    status: input.status ?? "received",
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.offerId) {
    assertUuid(input.offerId, "offerId");
    const { data, error } = await client.from("coach_offers")
      .update(payload).eq("id", input.offerId).eq("user_id", input.userId)
      .select("*").single();
    if (error) throw error;
    return mapOffer(data);
  }
  const { data, error } = await client.from("coach_offers")
    .insert(payload).select("*").single();
  if (error) throw error;
  return mapOffer(data);
}

export async function getOffer(userId: string, offerId: string): Promise<CoachOffer | null> {
  assertUuid(userId, "userId");
  assertUuid(offerId, "offerId");
  const client = await db();
  const { data, error } = await client.from("coach_offers")
    .select("*").eq("id", offerId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapOffer(data) : null;
}

export async function deleteOffer(userId: string, offerId: string): Promise<boolean> {
  assertUuid(userId, "userId");
  assertUuid(offerId, "offerId");
  const client = await db();
  const { data, error } = await client.from("coach_offers")
    .delete().eq("id", offerId).eq("user_id", userId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
