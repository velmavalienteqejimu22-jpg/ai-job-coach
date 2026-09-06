import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { evaluateAnswer } from "@/lib/interview/llm";
import { detectAnswerGap, buildNeedsMoreInputAssessment } from "@/lib/interview/low-info-detector";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { acquireInterviewGenerationClaim, completeInterviewGenerationClaim, releaseInterviewGenerationClaim } from "@/lib/interview-generation-claims";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/interview/llm");
jest.mock("@/lib/interview/low-info-detector");
jest.mock("@/lib/knowledge/context");
jest.mock("@/lib/interview-generation-claims");
jest.mock("@/lib/tokenpay-recovery");
jest.mock("@/lib/generation-context", () => ({
  runWithGenerationContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

function mockTableChain() {
  const q: Record<string, jest.Mock> = {};
  for (const m of ["select", "eq", "order"]) q[m] = jest.fn(() => q);
  q.single = jest.fn(async () => ({ data: null, error: null }));
  q.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  return q;
}

function mockDbClient(tables: Record<string, unknown>) {
  return {
    from: jest.fn((table: string) => {
      if (tables[table]) return tables[table];
      return mockTableChain();
    }),
  };
}

describe("interview answer POST", () => {
  const userId = "user-1";
  const sessionId = "session-1";
  const questionId = "question-1";
  const questionText = "请介绍你最近负责的一个产品项目";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
    (buildAgentKnowledgeContext as jest.Mock).mockResolvedValue({ items: [], contextText: "" });
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "idle" });
    (completeInterviewGenerationClaim as jest.Mock).mockResolvedValue(undefined);
    (releaseInterviewGenerationClaim as jest.Mock).mockResolvedValue(undefined);
    (tokenPayRecoveryResponse as jest.Mock).mockReturnValue(null);
  });

  test("returns needs_more_input for low-info answer", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD文本" }, error: null });
    const questionQ = mockTableChain();
    questionQ.single.mockResolvedValue({ data: { id: questionId, question_text: questionText }, error: null });
    const answerQ = mockTableChain();
    answerQ.insert = jest.fn().mockReturnValue(Promise.resolve({ data: null, error: null }));

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionQ,
      interview_answers: answerQ,
    }));
    (detectAnswerGap as jest.Mock).mockReturnValue({ kind: "placeholder", isLowInfo: true, reason: "placeholder", concreteSignals: [] });
    (buildNeedsMoreInputAssessment as jest.Mock).mockReturnValue({
      status: "needs_more_input",
      score: null,
      summary: "回答仅包含占位词，缺少具体信息。",
      evidence: [],
      missingEvidence: ["回答中未提供具体事实或经历"],
      dimensions: [],
      rewritePlan: ["请补充一个具体的事例或数据"],
      followUp: "能否用一句话说明你的实际做法或结果？",
    });

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "不知道" }),
    }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.assessment.status).toBe("needs_more_input");
    expect(body.assessment.score).toBeNull();
    expect(evaluateAnswer).not.toHaveBeenCalled();
    expect(completeInterviewGenerationClaim).toHaveBeenCalledWith(
      expect.stringMatching(/^answer:session-1:question-1:/),
      userId,
      expect.objectContaining({ status: "needs_more_input" })
    );
  });

  test("fails instead of pretending success when low-info persistence fails", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD文本" }, error: null });
    const questionQ = mockTableChain();
    questionQ.single.mockResolvedValue({ data: { id: questionId, question_text: questionText }, error: null });
    const answerQ = mockTableChain();
    answerQ.insert = jest.fn().mockResolvedValue({ data: null, error: new Error("write failed") });
    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionQ,
      interview_answers: answerQ,
    }));
    (detectAnswerGap as jest.Mock).mockReturnValue({ kind: "placeholder", isLowInfo: true, reason: "placeholder", concreteSignals: [] });
    (buildNeedsMoreInputAssessment as jest.Mock).mockReturnValue({ status: "needs_more_input", score: null });

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "不知道" }),
    }));

    expect(response.status).toBe(500);
    expect(releaseInterviewGenerationClaim).toHaveBeenCalledWith(
      expect.stringMatching(/^answer:session-1:question-1:/),
      userId
    );
  });

  test("calls LLM for normal answer and returns assessed", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD文本" }, error: null });
    const questionQ = mockTableChain();
    questionQ.single.mockResolvedValue({ data: { id: sessionId, question_text: questionText }, error: null });
    const answerQ = mockTableChain();
    answerQ.insert = jest.fn().mockReturnValue(Promise.resolve({ data: null, error: null }));

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionQ,
      interview_answers: answerQ,
    }));
    (detectAnswerGap as jest.Mock).mockReturnValue({ kind: "none", isLowInfo: false, concreteSignals: [] });
    (evaluateAnswer as jest.Mock).mockResolvedValue({
      status: "assessed",
      score: 80,
      summary: "回答较好",
      evidence: ["提到了项目背景"],
      missingEvidence: [],
      dimensions: [{ name: "逻辑性", score: 75, comment: "结构清晰" }],
      rewritePlan: ["补充数据"],
      followUp: "具体数据是多少？",
    });

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "我负责了用户增长项目" }),
    }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.assessment.status).toBe("assessed");
    expect(body.assessment.score).toBe(80);
    expect(evaluateAnswer).toHaveBeenCalled();
  });

  test("returns 401 for unauthenticated user", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "s", question_id: "q", answer: "a" }),
    }));

    expect(response.status).toBe(401);
  });

  test("returns 403 for session owned by another user", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: "other-user", round_type: "业务面", jd: "JD" }, error: null });
    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({ interview_sessions: sessionQ }));

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "回答" }),
    }));

    expect(response.status).toBe(403);
  });

  test("returns 409 for duplicate claim (processing)", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD" }, error: null });
    const questionQ = mockTableChain();
    questionQ.single.mockResolvedValue({ data: { id: questionId, question_text: questionText }, error: null });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionQ,
    }));
    (detectAnswerGap as jest.Mock).mockReturnValue({ kind: "none", isLowInfo: false, concreteSignals: [] });
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "processing" });

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "正常回答" }),
    }));

    expect(response.status).toBe(409);
  });

  test("returns 200 with idempotent replay for completed claim", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD" }, error: null });
    const questionQ = mockTableChain();
    questionQ.single.mockResolvedValue({ data: { id: questionId, question_text: questionText }, error: null });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionQ,
    }));
    (detectAnswerGap as jest.Mock).mockReturnValue({ kind: "none", isLowInfo: false, concreteSignals: [] });
    const cachedResult = { status: "assessed", score: 75, summary: "已缓存" };
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "completed", result: cachedResult });

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "正常回答" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-yi-zhi-idempotent-replay")).toBe("true");
    const body = await response.json();
    expect(body.assessment).toEqual(cachedResult);
  });

  test("LLM failure propagates error (no silent stub fallback)", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD" }, error: null });
    const questionQ = mockTableChain();
    questionQ.single.mockResolvedValue({ data: { id: questionId, question_text: questionText }, error: null });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionQ,
    }));
    (detectAnswerGap as jest.Mock).mockReturnValue({ kind: "none", isLowInfo: false, concreteSignals: [] });
    (evaluateAnswer as jest.Mock).mockRejectedValue(new Error("LLM provider timeout"));

    const response = await POST(new Request("http://localhost/api/interview/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, answer: "正常回答" }),
    }));

    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error).toContain("LLM provider timeout");
  });
});
