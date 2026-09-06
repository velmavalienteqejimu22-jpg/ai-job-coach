import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { summarizeInterview } from "@/lib/interview/llm";
import { acquireInterviewGenerationClaim, completeInterviewGenerationClaim, releaseInterviewGenerationClaim } from "@/lib/interview-generation-claims";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/interview/llm");
jest.mock("@/lib/interview-generation-claims");
jest.mock("@/lib/coach-harness/repository");
jest.mock("@/lib/tokenpay-recovery");
jest.mock("@/lib/generation-context", () => ({
  runWithGenerationContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

function mockTableChain() {
  const q: Record<string, jest.Mock> = {};
  for (const m of ["select", "eq", "order", "update"]) q[m] = jest.fn(() => q);
  q.single = jest.fn(async () => ({ data: null, error: null }));
  q.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
  q.then = jest.fn((resolve) => resolve({ data: null, error: null }));
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

const mockSummary = {
  overallScore: 80,
  grade: "A",
  gradeNext: "再练1次稳冲S级",
  verdict: "项目经验扎实",
  strengths: ["表达清晰"],
  weaknesses: ["缺少量化"],
  suggestions: ["补充数据"],
  dimensions: [{ name: "专业深度", score: 80, comment: "..." }],
  questionBreakdown: [{ questionId: "q1", score: 80, decisiveFinding: "清晰" }],
  nextActions: [{ title: "准备量化", reason: "缺数据", doneWhen: "能用数字说明", priority: "high" }],
};

describe("interview complete POST", () => {
  const userId = "user-1";
  const sessionId = "session-1";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "idle" });
    (completeInterviewGenerationClaim as jest.Mock).mockResolvedValue(undefined);
    (releaseInterviewGenerationClaim as jest.Mock).mockResolvedValue(undefined);
    (createOpportunitySnapshot as jest.Mock).mockResolvedValue({ id: "snap-1" });
    (tokenPayRecoveryResponse as jest.Mock).mockReturnValue(null);
  });

  test("generates summary with valid assessed answers", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: "opp-1" }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.single.mockResolvedValue({ data: null, error: null });
    // Override to return array - use select chain
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [{ id: "q1", question_text: "问题1" }], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ question_id: "q1", answer: "回答1", assessment: { status: "assessed", score: 80 } }],
          error: null,
        }),
      }),
    });

    const oppQ = mockTableChain();
    oppQ.maybeSingle = jest.fn().mockResolvedValue({ data: { metadata: { actions: [] } }, error: null });
    oppQ.update = jest.fn(() => oppQ);

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
      coach_opportunities: oppQ,
    }));
    (summarizeInterview as jest.Mock).mockResolvedValue(mockSummary);

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, opportunityId: "opp-1" }),
    }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.type).toBe("session-summary");
    expect(body.payload.summary.questionBreakdown).toBeDefined();
    expect(body.payload.summary.nextActions).toBeDefined();
    expect(summarizeInterview).toHaveBeenCalled();
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      snapshotType: "interview_feedback",
    }));
  });

  test("rejects summary when all answers are low-info", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: null }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ question_id: "q1", answer: "不知道", assessment: { status: "needs_more_input" } }],
          error: null,
        }),
      }),
    });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
    }));

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }));

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("低信息回答");
  });

  test("rejects summary when no answers exist", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: null }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
    }));

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }));

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("还没有任何答案");
  });

  test("returns 403 for session owned by another user", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: "other-user", round_type: "业务面", jd: "JD" }, error: null });
    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({ interview_sessions: sessionQ }));

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }));

    expect(response.status).toBe(403);
  });

  test("returns 409 for duplicate claim (processing)", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: null }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ assessment: { status: "assessed", score: 80 } }],
          error: null,
        }),
      }),
    });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
    }));
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "processing" });

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }));

    expect(response.status).toBe(409);
  });

  test("returns idempotent replay for completed claim", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: null }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ assessment: { status: "assessed", score: 80 } }],
          error: null,
        }),
      }),
    });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
    }));
    const cachedResult = { type: "session-summary", payload: { session_id: sessionId, summary: mockSummary } };
    (acquireInterviewGenerationClaim as jest.Mock).mockResolvedValue({ state: "completed", result: cachedResult });

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-yi-zhi-idempotent-replay")).toBe("true");
  });

  test("LLM failure propagates error (no silent stub fallback)", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: null }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ assessment: { status: "assessed", score: 80 } }],
          error: null,
        }),
      }),
    });

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
    }));
    (summarizeInterview as jest.Mock).mockRejectedValue(new Error("LLM provider down"));

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }));

    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error).toContain("LLM provider down");
  });

  test("snapshot write failure fails the request and releases the claim", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: "opp-1" }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ assessment: { status: "assessed", score: 80 } }],
          error: null,
        }),
      }),
    });

    const oppQ = mockTableChain();
    oppQ.maybeSingle = jest.fn().mockResolvedValue({ data: { metadata: { actions: [] } }, error: null });
    oppQ.update = jest.fn(() => oppQ);

    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
      coach_opportunities: oppQ,
    }));
    (summarizeInterview as jest.Mock).mockResolvedValue(mockSummary);
    (createOpportunitySnapshot as jest.Mock).mockRejectedValue(new Error("DB write failed"));

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, opportunityId: "opp-1" }),
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("DB write failed");
    expect(releaseInterviewGenerationClaim).toHaveBeenCalledWith(`summary:${sessionId}`, userId);
  });

  test("action persistence failure fails the request instead of reporting success", async () => {
    const sessionQ = mockTableChain();
    sessionQ.single.mockResolvedValue({ data: { id: sessionId, user_id: userId, round_type: "业务面", jd: "JD", opportunity_id: "opp-1" }, error: null });
    const questionsQ = mockTableChain();
    questionsQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [{ id: "q1", question_text: "问题1" }], error: null }),
      }),
    });
    const answersQ = mockTableChain();
    answersQ.select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [{ question_id: "q1", assessment: { status: "assessed", score: 80 } }],
          error: null,
        }),
      }),
    });
    const oppQ = mockTableChain();
    oppQ.maybeSingle.mockResolvedValue({ data: { metadata: { actions: [] } }, error: null });
    oppQ.then.mockImplementation((resolve) => resolve({ data: null, error: { message: "update failed" } }));
    (getDbClient as jest.Mock).mockResolvedValue(mockDbClient({
      interview_sessions: sessionQ,
      interview_questions: questionsQ,
      interview_answers: answersQ,
      coach_opportunities: oppQ,
    }));
    (summarizeInterview as jest.Mock).mockResolvedValue(mockSummary);

    const response = await POST(new Request("http://localhost/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, opportunityId: "opp-1" }),
    }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("同步下一步行动失败");
    expect(releaseInterviewGenerationClaim).toHaveBeenCalled();
  });
});
