import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient, getLatestResumeByUserId } from "@/lib/db";
import { generateInterviewQuestions } from "@/lib/interview/llm";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { finalizeQuota, reserveQuota } from "@/lib/quota";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/interview/llm");
jest.mock("@/lib/knowledge/context");
jest.mock("@/lib/quota");
jest.mock("@/lib/tokenpay-recovery");
jest.mock("@/lib/generation-context", () => ({
  runWithGenerationContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

function chain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq", "delete"]) q[method] = jest.fn(() => q);
  q.insert = jest.fn(async () => result);
  q.maybeSingle = jest.fn(async () => result);
  q.then = jest.fn((resolve) => resolve(result));
  return q;
}

describe("interview start POST", () => {
  const userId = "user-1";
  const opportunityId = "opp-1";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
    (getLatestResumeByUserId as jest.Mock).mockResolvedValue(null);
    (buildAgentKnowledgeContext as jest.Mock).mockResolvedValue({ items: [], contextText: "" });
    (reserveQuota as jest.Mock).mockResolvedValue({ id: "quota-1" });
    (finalizeQuota as jest.Mock).mockResolvedValue(undefined);
    (tokenPayRecoveryResponse as jest.Mock).mockReturnValue(null);
    (generateInterviewQuestions as jest.Mock).mockResolvedValue([
      { id: "q1", session_id: "session", question_text: "问题1", tips: {}, created_at: "2026-09-04T00:00:00.000Z" },
    ]);
  });

  test("uses the opportunity JD as canonical context even when the body omits jd", async () => {
    const opportunityQ = chain({ data: { id: opportunityId, jd_text: "数据库中的真实 JD" }, error: null });
    const sessionQ = chain();
    const questionsQ = chain();
    (getDbClient as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => ({
        coach_opportunities: opportunityQ,
        interview_sessions: sessionQ,
        interview_questions: questionsQ,
      })[table]),
    });

    const response = await POST(new Request("http://localhost/api/interview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId, roundType: "业务面", questionCount: 1 }),
    }));

    expect(response.status).toBe(200);
    expect(generateInterviewQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        jd: "数据库中的真实 JD",
        roundType: "业务面",
        count: 1,
        sessionId: expect.any(String),
        // contextText 已由 ContextBundle 渲染产出，包含带标注的 JD
        contextText: expect.stringContaining("岗位 JD"),
      })
    );
    expect(sessionQ.insert).toHaveBeenCalledWith(expect.objectContaining({
      jd: "数据库中的真实 JD",
      opportunity_id: opportunityId,
    }));
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), true);
  });

  test("fails and refunds quota when generated questions cannot be persisted", async () => {
    const opportunityQ = chain({ data: { id: opportunityId, jd_text: "JD" }, error: null });
    const sessionQ = chain();
    const questionsQ = chain({ data: null, error: { message: "write failed" } });
    (getDbClient as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => ({
        coach_opportunities: opportunityQ,
        interview_sessions: sessionQ,
        interview_questions: questionsQ,
      })[table]),
    });

    const response = await POST(new Request("http://localhost/api/interview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId, roundType: "业务面", questionCount: 1 }),
    }));

    expect(response.status).toBe(500);
    expect(sessionQ.delete).toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
  });
});
