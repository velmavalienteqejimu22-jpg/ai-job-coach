/**
 * plans.ts 存储层测试：切换语义（复用按目标+岗位过滤/并行不暂停/新建）、
 * 乐观锁、owner 过滤。
 */

jest.mock("@/lib/db");

import { getDbClient } from "@/lib/db";
import {
  GOAL_TYPES,
  createStandaloneArtifact,
  getCurrentPlan,
  getPlanById,
  saveOffer,
  seedTaskForEntry,
  switchPlan,
  updatePlanTasks,
} from "./plans";

type Row = Record<string, unknown>;

interface CallLogEntry { table: string; method: string; args: unknown[] }

const USER = "00000000-0000-4000-8000-000000000001";
const OPP = "00000000-0000-4000-8000-000000000002";
const OPP_B = "00000000-0000-4000-8000-00000000000a";
const PLAN_ID = "00000000-0000-4000-8000-000000000003";
const PLAN_OLD = "00000000-0000-4000-8000-000000000004";
const OFFER_ID = "00000000-0000-4000-8000-000000000005";
const ART_ID = "00000000-0000-4000-8000-000000000006";

/** Supabase 风格链式 mock：链式调用返回自身并记录 (table, method, args)，await 时按 step resolve */
function chain(result: { data?: unknown; error?: unknown } = {}, log?: CallLogEntry[], table = "?") {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, method: string) {
      if (method === "then") {
        return (resolve: (v: unknown) => void) => {
          // supabase postgrest：查询级错误（如 PGRST116）走 resolve {data, error}，不 reject
          resolve({ data: result.data ?? null, error: result.error ?? null });
        };
      }
      return (...args: unknown[]) => {
        log?.push({ table, method, args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler) as unknown as Record<string, unknown> & PromiseLike<unknown>;
  return proxy;
}

function mockDb(tables: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const queues = structuredClone(tables);
  const log: CallLogEntry[] = [];
  const from = jest.fn((table: string) => {
    const queue = queues[table] ?? [];
    const step = queue.shift() ?? {};
    return chain(step, log, table);
  });
  (getDbClient as jest.Mock).mockResolvedValue({ from });
  return { from, queues, log };
}

const planRow = (overrides: Row = {}): Row => ({
  id: PLAN_ID,
  user_id: USER,
  goal_type: "negotiating",
  opportunity_id: null,
  version: 1,
  status: "active",
  focused_at: "2026-09-06T00:00:00Z",
  tasks: [seedTaskForEntry("negotiating")],
  revision_reason: null,
  created_at: "2026-09-06T00:00:00Z",
  updated_at: "2026-09-06T00:00:00Z",
  ...overrides,
});

describe("seedTaskForEntry", () => {
  test("每类入口都有首个任务，且任务不同", () => {
    const tasks = GOAL_TYPES.map((goalType) => seedTaskForEntry(goalType));
    expect(new Set(tasks.map((t) => t.title)).size).toBe(GOAL_TYPES.length);
    for (const task of tasks) {
      expect(task.status).toBe("todo");
      expect(task.reason).toBeTruthy();
      expect(task.entryType).toBeTruthy();
    }
  });

  test("从零学的任务描述不要求材料，谈薪不要求先完成任何课程", () => {
    const learn = seedTaskForEntry("learn_from_zero");
    const negotiate = seedTaskForEntry("negotiating");
    expect(learn.description).not.toMatch(/JD|简历/);
    expect(negotiate.description).not.toMatch(/先完成/);
  });
});

describe("getCurrentPlan", () => {
  test("返回映射后的当前 active 计划", async () => {
    mockDb({ coach_plans: [{ data: planRow() }] });
    const plan = await getCurrentPlan(USER);
    expect(plan?.goalType).toBe("negotiating");
    expect(plan?.tasks.length).toBe(1);
  });

  test("无计划返回 null", async () => {
    mockDb({ coach_plans: [{ data: null }] });
    const plan = await getCurrentPlan(USER);
    expect(plan).toBeNull();
  });
});

describe("getPlanById", () => {
  test("按 ID 取计划且映射完整（多标签回写用）", async () => {
    const { log } = mockDb({ coach_plans: [{ data: planRow() }] });
    const plan = await getPlanById(USER, PLAN_ID);
    expect(plan?.id).toBe(PLAN_ID);
    expect(plan?.goalType).toBe("negotiating");
    // owner 过滤：查询必须带 user_id，不能仅凭 planId 取到别人的计划
    const eqCalls = log.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "user_id" && c.args[1] === USER)).toBe(true);
    expect(eqCalls.some((c) => c.args[0] === "id" && c.args[1] === PLAN_ID)).toBe(true);
  });

  test("计划不存在返回 null（PGRST116 走 resolve 不 reject）", async () => {
    mockDb({ coach_plans: [{ data: null }] });
    const plan = await getPlanById(USER, PLAN_ID);
    expect(plan).toBeNull();
  });
});

describe("switchPlan", () => {
  test("同目标同岗位：原样返回，不暂停不新建（只有 1 次查询）", async () => {
    const { from } = mockDb({ coach_plans: [{ data: planRow() }] });
    const { plan, reactivated } = await switchPlan({ userId: USER, goalType: "negotiating" });
    expect(reactivated).toBe(true);
    expect(plan.id).toBe(PLAN_ID);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test("切换目标：复用同目标旧计划（含 paused），不暂停当前计划——多计划并行", async () => {
    const { from, log } = mockDb({
      coach_plans: [
        { data: planRow() }, // getCurrentPlan → negotiating active（当前计划）
        { data: planRow({ id: PLAN_OLD, goal_type: "learn_from_zero", status: "paused" }) }, // find reusable
        { data: planRow({ id: PLAN_OLD, goal_type: "learn_from_zero", status: "active" }) }, // reactivate
      ],
    });
    const { plan, reactivated } = await switchPlan({ userId: USER, goalType: "learn_from_zero" });
    expect(reactivated).toBe(true);
    expect(plan.id).toBe(PLAN_OLD);
    expect(plan.status).toBe("active");
    expect(from).toHaveBeenCalledTimes(3);
    // 关键：全程不允许出现把当前计划置为 paused 的 update——切换≠其他计划停止
    const pauseUpdates = log.filter((c) => c.table === "coach_plans" && c.method === "update"
      && (c.args[0] as Row)?.status === "paused");
    expect(pauseUpdates).toHaveLength(0);
  });

  test("同目标但岗位不同：不复用旧计划（不串岗位），新建独立计划", async () => {
    const { from, log } = mockDb({
      coach_plans: [
        { data: planRow({ goal_type: "prepare_apply", opportunity_id: OPP }) }, // getCurrentPlan → A 岗位计划
        { data: null }, // find reusable → 无（真实 DB 会按岗位过滤掉 A 的计划）
        { data: planRow({ goal_type: "prepare_apply", opportunity_id: OPP_B }) }, // insert
      ],
    });
    const { plan, reactivated } = await switchPlan({
      userId: USER, goalType: "prepare_apply", opportunityId: OPP_B,
    });
    expect(reactivated).toBe(false);
    expect(plan.opportunityId).toBe(OPP_B);
    expect(from).toHaveBeenCalledTimes(3);
    // 复用查询必须按岗位过滤：不允许出现跨岗位复用（第 1 个 select 是 getCurrentPlan，第 2 个是复用查询）
    const selects = log.filter((c) => c.method === "select");
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const reusableStart = log.indexOf(selects[1]);
    const filter = log.slice(reusableStart).find((c) => c.method === "eq" && c.args[0] === "opportunity_id");
    expect(filter?.args[1]).toBe(OPP_B);
    // 旧计划的原样保留：没有 update 把 opportunity_id 改写成新岗位
    const rewrite = log.filter((c) => c.method === "update" && (c.args[0] as Row)?.opportunity_id === OPP_B);
    expect(rewrite).toHaveLength(0);
  });

  test("无岗位入口：复用查询按 opportunity_id is null 过滤", async () => {
    const { log } = mockDb({
      coach_plans: [
        { data: null }, // getCurrentPlan → 无
        { data: null }, // find reusable → 无
        { data: planRow() }, // insert
      ],
    });
    await switchPlan({ userId: USER, goalType: "negotiating" });
    const isNull = log.find((c) => c.method === "is" && c.args[0] === "opportunity_id");
    expect(isNull?.args[1]).toBeNull();
  });

  test("无旧计划可复用：新建并 seed 首个任务，其他计划保持 active", async () => {
    const { from, log } = mockDb({
      coach_plans: [
        { data: planRow() }, // getCurrentPlan → negotiating active
        { data: null }, // find reusable → 无
        { data: planRow({ id: PLAN_OLD, goal_type: "interviewing" }) }, // insert
      ],
    });
    const { plan, reactivated } = await switchPlan({ userId: USER, goalType: "interviewing" });
    expect(reactivated).toBe(false);
    expect(plan.id).toBe(PLAN_OLD);
    expect(plan.tasks).toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(3);
    // 当前计划未被暂停：没有任何 paused 状态的写入
    const pauseUpdates = log.filter((c) => c.method === "update" && (c.args[0] as Row)?.status === "paused");
    expect(pauseUpdates).toHaveLength(0);
  });
});

describe("updatePlanTasks", () => {
  test("版本匹配时更新并递增 version", async () => {
    const { from } = mockDb({ coach_plans: [{ data: planRow({ version: 2 }) }] });
    const plan = await updatePlanTasks({
      userId: USER, planId: PLAN_ID, tasks: [], reason: "test", expectedVersion: 1,
    });
    expect(plan.version).toBe(2);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test("版本冲突（0 行更新）时抛错而不是覆盖", async () => {
    mockDb({ coach_plans: [{ error: { code: "PGRST116", message: "0 rows" } }] });
    await expect(updatePlanTasks({
      userId: USER, planId: PLAN_ID, tasks: [], reason: "test", expectedVersion: 1,
    })).rejects.toThrow("计划更新冲突");
  });
});

describe("offers", () => {
  test("saveOffer 新建，unknowns 如实保留", async () => {
    const { from } = mockDb({ coach_offers: [{ data: {
      id: OFFER_ID, opportunity_id: OPP, terms: { base: 30000, unknowns: ["equity"] },
      priorities: ["现金"], status: "received", notes: null,
      created_at: "2026-09-06T00:00:00Z", updated_at: "2026-09-06T00:00:00Z",
    } }] });
    const offer = await saveOffer({ userId: USER, opportunityId: OPP, terms: { base: 30000, unknowns: ["equity"] } });
    expect(offer.terms.base).toBe(30000);
    expect(offer.terms.unknowns).toEqual(["equity"]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test("createStandaloneArtifact 落 opportunity_id=null 的产物", async () => {
    const { from } = mockDb({ coach_artifacts: [{ data: { id: ART_ID, version: 1 } }] });
    const artifact = await createStandaloneArtifact({ userId: USER, title: "第一课产物", content: { a: 1 } });
    expect(artifact.id).toBe(ART_ID);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
