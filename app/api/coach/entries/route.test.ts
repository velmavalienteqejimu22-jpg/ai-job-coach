import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getCurrentPlan, getPlanHistory, switchPlan } from "@/lib/coach-harness/plans";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/plans", () => ({
  GOAL_LABELS: {
    learn_from_zero: "从零学",
    prepare_apply: "准备投递",
    interviewing: "准备面试",
    negotiating: "谈薪",
  },
  GOAL_TYPES: ["learn_from_zero", "prepare_apply", "interviewing", "negotiating"],
  getCurrentPlan: jest.fn(),
  getPlanHistory: jest.fn(),
  switchPlan: jest.fn(),
}));

const planStub = {
  id: "plan-1",
  goalType: "negotiating",
  opportunityId: null,
  version: 1,
  status: "active",
  tasks: [{
    id: "task-1", title: "梳理 offer 条款与个人取舍", description: "",
    status: "todo", reason: "你选择谈薪。不需要 JD、简历或第一课。", entryType: "negotiating",
  }],
  revisionReason: null, createdAt: "", updatedAt: "",
};

describe("coach entries GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    (getCurrentPlan as jest.Mock).mockResolvedValue(null);
    (getPlanHistory as jest.Mock).mockResolvedValue([]);
  });

  test("四类入口全部可用（验收 17/18：谈薪和从零学无材料门槛）", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.entries).toHaveLength(4);
    for (const entry of body.entries) expect(entry.available).toBe(true);
  });

  test("无 active 计划时 activePlan 为 null", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.activePlan).toBeNull();
  });

  test("history 返回 opportunityId——前端点选计划时必须带回岗位 ID", async () => {
    (getPlanHistory as jest.Mock).mockResolvedValue([
      {
        id: "plan-2", goalType: "prepare_apply", opportunityId: "opp-1", status: "active", version: 1,
        tasks: [
          { id: "t1", title: "", description: "", status: "done", reason: "", entryType: "prepare_apply" },
          { id: "t2", title: "", description: "", status: "todo", reason: "", entryType: "prepare_apply" },
        ],
        revisionReason: null, createdAt: "", updatedAt: "",
      },
    ]);
    const response = await GET();
    const body = await response.json();
    expect(body.history[0].opportunityId).toBe("opp-1");
    expect(body.history[0].doneCount).toBe(1);
    expect(body.history[0].taskCount).toBe(2);
  });
});

describe("coach entries POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
  });

  test("谈薪入口返回 offer_terms 落地动作和首个任务", async () => {
    (switchPlan as jest.Mock).mockResolvedValue({ plan: planStub, reactivated: false });
    const response = await POST(new Request("http://localhost/api/coach/entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalType: "negotiating" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.landingAction).toBe("open_offer_terms");
    expect(body.nextTask.entryType).toBe("negotiating");
    expect(switchPlan).toHaveBeenCalledWith(expect.objectContaining({ goalType: "negotiating" }));
  });

  test("从零学入口返回第一课落地动作", async () => {
    (switchPlan as jest.Mock).mockResolvedValue({
      plan: { ...planStub, goalType: "learn_from_zero", tasks: [{ ...planStub.tasks[0], entryType: "learn_from_zero" }] },
      reactivated: false,
    });
    const response = await POST(new Request("http://localhost/api/coach/entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalType: "learn_from_zero" }),
    }));
    const body = await response.json();
    expect(body.landingAction).toBe("open_first_lesson");
  });

  test("无效入口返回 400", async () => {
    const response = await POST(new Request("http://localhost/api/coach/entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalType: "become_ceo" }),
    }));
    expect(response.status).toBe(400);
  });
});
