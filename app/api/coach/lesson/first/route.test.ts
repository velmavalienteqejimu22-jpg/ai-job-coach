import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createStandaloneArtifact, getCurrentPlan, getPlanById, updatePlanTasks } from "@/lib/coach-harness/plans";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/plans", () => ({
  createStandaloneArtifact: jest.fn(),
  getCurrentPlan: jest.fn(),
  getPlanById: jest.fn(),
  updatePlanTasks: jest.fn(),
}));

const USER = "00000000-0000-4000-8000-000000000001";
const PLAN_OPEN = "00000000-0000-4000-8000-000000000101";
const TASK_OPEN = "00000000-0000-4000-8000-000000000102";
const PLAN_MISSING = "00000000-0000-4000-8000-000000000103";

const lessonPlan = (overrides: Record<string, unknown> = {}) => ({
  id: PLAN_OPEN, goalType: "learn_from_zero", version: 1,
  tasks: [{ id: TASK_OPEN, title: "第一课", description: "", status: "todo", reason: "", entryType: "learn_from_zero" }],
  ...overrides,
});

const postRequest = (payload: Record<string, unknown>) =>
  new Request("http://localhost/api/coach/lesson/first", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("first lesson GET", () => {
  beforeEach(() => {
    // resetAllMocks（而非 clearAllMocks）：mockRejectedValue 等实现不能泄漏到下个用例
    jest.resetAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (getCurrentPlan as jest.Mock).mockResolvedValue(null);
    (getPlanById as jest.Mock).mockResolvedValue(null);
  });

  test("返回案例+讲解+题目（不含答案下标），声明无材料要求", async () => {
    const response = await GET(new Request("http://localhost/api/coach/lesson/first"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.lesson.case).toBeTruthy();
    expect(body.lesson.teaching).toHaveLength(3);
    expect(body.lesson.questions).toHaveLength(3);
    for (const q of body.lesson.questions) {
      expect(q.correctIndex).toBeUndefined(); // 不把答案提前泄漏给前端
    }
    expect(body.noMaterialsRequired).toBe(true);
  });

  test("明确传 planId 时按 ID 取任务，不读当前聚焦计划（跨标签时序防串）", async () => {
    (getPlanById as jest.Mock).mockResolvedValue(lessonPlan({ version: 3 }));
    const response = await GET(new Request(`http://localhost/api/coach/lesson/first?planId=${PLAN_OPEN}`));
    const body = await response.json();
    expect(getPlanById).toHaveBeenCalledWith(USER, PLAN_OPEN);
    expect(getCurrentPlan).not.toHaveBeenCalled();
    expect(body.binding).toEqual({ planId: PLAN_OPEN, taskId: TASK_OPEN, expectedVersion: 3 });
  });

  test("不传 planId 时才读当前聚焦计划返回绑定", async () => {
    (getCurrentPlan as jest.Mock).mockResolvedValue(lessonPlan({ id: "00000000-0000-4000-8000-000000000109", version: 2 }));
    const response = await GET(new Request("http://localhost/api/coach/lesson/first"));
    const body = await response.json();
    expect(getCurrentPlan).toHaveBeenCalled();
    expect(body.binding).not.toBeNull();
  });

  test("无计划时 binding 为 null", async () => {
    const response = await GET(new Request("http://localhost/api/coach/lesson/first"));
    const body = await response.json();
    expect(body.binding).toBeNull();
  });

  test("planId 格式无效返回 400", async () => {
    const response = await GET(new Request("http://localhost/api/coach/lesson/first?planId=not-a-uuid"));
    expect(response.status).toBe(400);
  });

  test("带 planId 但读取失败时显式报错（502），不吞成空计划静默降级成独立练习", async () => {
    (getPlanById as jest.Mock).mockRejectedValue(new Error("数据库连接失败"));
    const response = await GET(new Request(`http://localhost/api/coach/lesson/first?planId=${PLAN_OPEN}`));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("数据库");
    expect(body.binding).toBeUndefined(); // 失败响应里没有 binding，前端无从误用
  });

  test("不带 planId 但当前计划读取失败同样显式报错", async () => {
    (getCurrentPlan as jest.Mock).mockRejectedValue(new Error("数据库连接失败"));
    const response = await GET(new Request("http://localhost/api/coach/lesson/first"));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("数据库");
  });
});

describe("first lesson POST", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (getCurrentPlan as jest.Mock).mockResolvedValue(null);
    (getPlanById as jest.Mock).mockResolvedValue(null);
    (createStandaloneArtifact as jest.Mock).mockResolvedValue({ id: "art-1", version: 1 });
  });

  test("全对时确定性判分正确并保存产物", async () => {
    const response = await POST(postRequest({ answers: [1, 0, 1], openAnswer: "先确认 15% 的口径" }));
    const body = await response.json();
    expect(body.mcqScore).toBe("3/3");
    expect(body.artifactId).toBe("art-1");
    expect(body.openAnswerSaved).toBe(true);
    expect(createStandaloneArtifact).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ openAnswer: "先确认 15% 的口径" }),
    }));
  });

  test("答错的题目给解释，不假装通过", async () => {
    const response = await POST(postRequest({ answers: [0, 0, 1], openAnswer: "先确认口径" }));
    const body = await response.json();
    expect(body.results[0].correct).toBe(false);
    expect(body.results[0].explanation).toBeTruthy();
    expect(body.mcqScore).toBe("2/3");
  });

  test("带完整绑定时按 ID 回写开课时的计划（乐观锁版本）", async () => {
    (getPlanById as jest.Mock).mockResolvedValue(lessonPlan({ version: 2 }));
    (updatePlanTasks as jest.Mock).mockResolvedValue({});
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: PLAN_OPEN, taskId: TASK_OPEN, expectedVersion: 2,
    }));
    const body = await response.json();
    expect(body.taskCompleted).toBe(true);
    expect(body.taskError).toBeNull();
    expect(getPlanById).toHaveBeenCalledWith(USER, PLAN_OPEN);
    expect(updatePlanTasks).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_OPEN, expectedVersion: 2,
      tasks: [expect.objectContaining({ status: "done", artifactId: "art-1" })],
    }));
  });

  test("缺绑定时不回退当前计划，只保存独立练习（跨标签时序下当前计划不可信）", async () => {
    // 即使存在带第一课任务的当前聚焦计划，也不许动它
    (getCurrentPlan as jest.Mock).mockResolvedValue(lessonPlan());
    const response = await POST(postRequest({ answers: [1, 0, 1], openAnswer: "先看漏斗" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.artifactId).toBe("art-1");
    expect(body.taskCompleted).toBe(false);
    expect(body.bindingWarning).toContain("未绑定计划");
    expect(updatePlanTasks).not.toHaveBeenCalled();
    expect(getCurrentPlan).not.toHaveBeenCalled();
  });

  test("绑定不完整（缺 expectedVersion）返回 400，且零写入——校验先于保存", async () => {
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: PLAN_OPEN, taskId: TASK_OPEN,
    }));
    expect(response.status).toBe(400);
    expect(createStandaloneArtifact).not.toHaveBeenCalled(); // 不能先写产物再报 400
    expect(updatePlanTasks).not.toHaveBeenCalled();
  });

  test("绑定字段非法（planId 非 UUID）返回 400，同样零写入", async () => {
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: "not-a-uuid", taskId: TASK_OPEN, expectedVersion: 1,
    }));
    expect(response.status).toBe(400);
    expect(createStandaloneArtifact).not.toHaveBeenCalled();
    expect(updatePlanTasks).not.toHaveBeenCalled();
  });

  test("updatePlanTasks 失败时如实返回 taskCompleted=false，不假报完成", async () => {
    (getPlanById as jest.Mock).mockResolvedValue(lessonPlan({ version: 1 }));
    (updatePlanTasks as jest.Mock).mockRejectedValue(new Error("计划更新冲突：请刷新后重试（期望版本 1）"));
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: PLAN_OPEN, taskId: TASK_OPEN, expectedVersion: 1,
    }));
    const body = await response.json();
    expect(response.status).toBe(200); // 产物已保存，整体仍是成功提交
    expect(body.ok).toBe(true);
    expect(body.artifactId).toBe("art-1");
    expect(body.taskCompleted).toBe(false);
    expect(body.taskError).toContain("计划更新冲突");
  });

  test("数据库读取失败如实说数据库问题，不冒充「计划已删除」", async () => {
    (getPlanById as jest.Mock).mockRejectedValue(new Error("数据库连接失败"));
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: PLAN_OPEN, taskId: TASK_OPEN, expectedVersion: 1,
    }));
    const body = await response.json();
    expect(body.taskCompleted).toBe(false);
    expect(body.taskError).toContain("数据库");
    expect(body.taskError).not.toContain("已不存在");
    expect(body.bindingWarning).toBeNull();
  });

  test("绑定指向的计划不存在时给出删除警告（区别于数据库故障）", async () => {
    (getPlanById as jest.Mock).mockResolvedValue(null);
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: PLAN_MISSING, taskId: TASK_OPEN, expectedVersion: 1,
    }));
    const body = await response.json();
    expect(body.taskCompleted).toBe(false);
    expect(body.bindingWarning).toContain("已不存在");
    expect(body.taskError).toBeNull();
  });

  test("绑定的任务已完成时如实说明，不重写（不覆盖原产物关联）", async () => {
    (getPlanById as jest.Mock).mockResolvedValue(lessonPlan({
      tasks: [{ id: TASK_OPEN, title: "第一课", description: "", status: "done", reason: "", entryType: "learn_from_zero" }],
    }));
    const response = await POST(postRequest({
      answers: [1, 0, 1], openAnswer: "先看漏斗",
      planId: PLAN_OPEN, taskId: TASK_OPEN, expectedVersion: 1,
    }));
    const body = await response.json();
    expect(body.taskCompleted).toBe(false);
    expect(body.bindingWarning).toContain("已完成");
    expect(updatePlanTasks).not.toHaveBeenCalled();
  });

  test("缺少开放答案返回 400（首份产物必须有用户自己的下一步）", async () => {
    const response = await POST(postRequest({ answers: [1, 0, 1] }));
    expect(response.status).toBe(400);
  });

  test.each([
    { answers: [0.5, 0, 1] },
    { planId: PLAN_OPEN, taskId: TASK_OPEN, expectedVersion: 1.5 },
    { expectedVersion: "1" },
    { planId: null },
  ])("拒绝非法下标或绑定，且不产生写入：%j", async (invalid) => {
    const response = await POST(postRequest({ answers: [1, 0, 1], openAnswer: "确认口径", ...invalid }));
    expect(response.status).toBe(400);
    expect(createStandaloneArtifact).not.toHaveBeenCalled();
    expect(updatePlanTasks).not.toHaveBeenCalled();
  });

  test("保存失败返回可识别错误，不能标记任务完成", async () => {
    (createStandaloneArtifact as jest.Mock).mockRejectedValue(new Error("database unavailable"));
    const response = await POST(postRequest({ answers: [1, 0, 1], openAnswer: "确认口径" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, taskCompleted: false });
    expect(updatePlanTasks).not.toHaveBeenCalled();
  });

  test("开放答案不判定对错（openAnswerNote 如实说明）", async () => {
    const response = await POST(postRequest({ answers: [1, 0, 1], openAnswer: "随便写的一句" }));
    const body = await response.json();
    expect(body.openAnswerNote).toContain("未做对错判定");
  });
});
