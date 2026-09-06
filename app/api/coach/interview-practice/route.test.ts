import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import {
  ContextBudgetExceededError,
  assertContextFits,
  renderContextForPrompt,
} from "@/lib/coach-harness";
import { createOpportunitySnapshot, getContextBundleForUser } from "@/lib/coach-harness/repository";
import { evaluateQuickPractice } from "@/lib/interview/practice";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/coach-harness/repository");
jest.mock("@/lib/coach-harness", () => ({
  ContextBudgetExceededError: class extends Error {
    blocked: Array<{ kind: string; refId: string; cost: number }>;
    status = 422;
    constructor(message: string, blocked: Array<{ kind: string; refId: string; cost: number }>) {
      super(message);
      this.name = "ContextBudgetExceededError";
      this.blocked = blocked;
    }
  },
  assertContextFits: jest.fn(),
  renderContextForPrompt: jest.fn(),
}));
jest.mock("@/lib/interview/practice");
jest.mock("@/lib/tokenpay-recovery", () => ({ tokenPayRecoveryResponse: () => null }));

function chain(final: Record<string, unknown>) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq", "contains"]) query[method] = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => final);
  query.gte = jest.fn(async () => final);
  return query;
}

describe("coach interview practice POST", () => {
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    const opportunityQuery = chain({ data: { id: "opportunity-1" }, error: null });
    const countQuery = chain({ count: 0, error: null });
    (getDbClient as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => table === "coach_opportunities" ? opportunityQuery : countQuery),
    });
    (createOpportunitySnapshot as jest.Mock).mockResolvedValue({ id: "snapshot-1" });
    (getContextBundleForUser as jest.Mock).mockResolvedValue({
      version: 2,
      selection: { included: [{ kind: "attachment", refId: "job-description" }], excluded: [] },
      usage: { usedTokens: 800, truncated: false },
      budget: { maxInputTokens: 12_000 },
      fingerprint: "abc123",
    });
    (renderContextForPrompt as jest.Mock).mockReturnValue({
      text: "【目标岗位·待确认·用户材料】\n字节 AI PM",
      sections: [],
      usedTokens: 800,
      truncated: false,
      warnings: [],
    });
    (assertContextFits as jest.Mock).mockReturnValue(undefined);
    (evaluateQuickPractice as jest.Mock).mockResolvedValue({
      verdict: "证据不足",
      summary: "缺少个人动作。",
      strengths: ["方向相关"],
      gaps: ["缺动作"],
      followUp: "你做了什么？",
      improvedOutline: ["结论", "动作", "结果"],
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("compiles a ContextBundle with question/answer/JD/resume attachments", async () => {
    const response = await POST(new Request("http://localhost/api/coach/interview-practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opportunity-1", question: "如何评测？", answer: "我做了抽检", jobDescription: "负责评测", resumeText: "搭建过评测流程" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.record).toEqual(expect.objectContaining({ id: "snapshot-1", verdict: "证据不足" }));
    // 编译 ContextBundle 时要把题目、回答、JD、简历正确放进去
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      opportunityId: "opportunity-1",
      task: "mock_interview",
      questionSource: { id: "quick-practice-question", text: "如何评测？" },
      currentInput: "我做了抽检",
      attachments: [
        expect.objectContaining({ id: "job-description", text: "负责评测", required: true }),
        expect.objectContaining({ id: "resume-text", text: "搭建过评测流程", required: false }),
      ],
      budget: { maxInputTokens: 12_000 },
    }));
    // 题目 / 回答不出现在「上下文」列表里，由 prompt 自己承载
    expect(renderContextForPrompt).toHaveBeenCalledWith(expect.anything(), {
      excludeKinds: ["question_source", "current_input"],
    });
    // 评估函数拿到的 contextText 是渲染器输出，不是 raw JD
    expect(evaluateQuickPractice).toHaveBeenCalledWith(expect.objectContaining({
      question: "如何评测？",
      answer: "我做了抽检",
      contextText: expect.stringContaining("目标岗位"),
    }));
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", opportunityId: "opportunity-1", snapshotType: "interview_feedback",
      metadata: expect.objectContaining({ mode: "quick_practice", contextFingerprint: "abc123" }),
    }));
    expect(body.context).toEqual(expect.objectContaining({ fingerprint: "abc123", budget: 12_000 }));
  });

  test("returns 422 + blocked when JD/resume cannot fit the budget", async () => {
    (assertContextFits as jest.Mock).mockImplementation(() => {
      throw new ContextBudgetExceededError("关键内容装不进 12000 token", [{ kind: "attachment", refId: "job-description", cost: 15_000 }]);
    });
    const response = await POST(new Request("http://localhost/api/coach/interview-practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opportunity-1", question: "如何评测？", answer: "我做了抽检", jobDescription: "负责评测".repeat(8_000), resumeText: "" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.blocked).toEqual([{ kind: "attachment", refId: "job-description", cost: 15_000 }]);
    expect(body.saved).toBe(true);
    // 已经把「待分析」快照落库，不会丢这次回答
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "system" }));
  });

  test("still stores the raw answer when analysis fails", async () => {
    (evaluateQuickPractice as jest.Mock).mockRejectedValue(new Error("provider down"));
    const response = await POST(new Request("http://localhost/api/coach/interview-practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opportunity-1", question: "如何评测？", answer: "我做了抽检" }),
    }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ saved: true }));
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "system" }));
  });
});