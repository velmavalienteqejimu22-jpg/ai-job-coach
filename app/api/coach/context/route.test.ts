import { GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { renderContextForPrompt } from "@/lib/coach-harness";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness", () => ({
  renderContextForPrompt: jest.fn(),
}));
jest.mock("@/lib/coach-harness/repository", () => ({
  getContextBundleForUser: jest.fn(),
}));

const stubBundle = (overrides: Record<string, unknown> = {}) => ({
  version: 2,
  task: "resume_workshop" as const,
  userId: "user-1",
  intent: null,
  planVersion: null,
  selectedOpportunityIds: [],
  deadline: null,
  userOverride: false,
  opportunity: null,
  claims: [],
  artifacts: [],
  knowledge: [],
  knowledgeContext: "",
  currentInput: null,
  questionSource: null,
  historySummary: null,
  attachments: [],
  allowedClaimIds: [],
  unverifiedClaimIds: [],
  blockedClaimIds: [],
  blockedClaimDetails: [],
  conflicts: [],
  budget: { routeClass: "bounded_orchestration" as const, maxInputTokens: 12_000, maxModelCalls: 3, maxToolCalls: 6 },
  selection: { included: [{ kind: "attachment" as const, refId: "jd", trustType: "user_material" as const, reason: "x", estimatedTokens: 100, rule: "required:attachment" as const, priority: 2, required: true }], excluded: [] },
  usage: { usedTokens: 100, truncated: false },
  compiledAt: "2026-09-05T00:00:00.000Z",
  fingerprint: "fp-1",
  ...overrides,
});

const stubRendered = (overrides: Record<string, unknown> = {}) => ({
  text: "【附带材料·待确认·用户材料】[jd]\nJD 内容",
  sections: [
    { kind: "attachment" as const, refId: "jd", trustType: "user_material" as const, rule: "required:attachment" as const, priority: 2, text: "JD 内容", estimatedTokens: 100 },
  ],
  usedTokens: 100,
  truncated: false,
  warnings: [],
  ...overrides,
});

describe("coach context GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    (getContextBundleForUser as jest.Mock).mockResolvedValue(stubBundle());
    (renderContextForPrompt as jest.Mock).mockReturnValue(stubRendered());
  });

  test("rejects unauthenticated requests", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/coach/context?task=resume_workshop"));
    expect(response.status).toBe(401);
  });

  test("rejects unknown tasks", async () => {
    const response = await GET(new Request("http://localhost/api/coach/context?task=bogus"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/无效任务/);
  });

  test("returns context bundle by default", async () => {
    const response = await GET(new Request("http://localhost/api/coach/context?task=resume_workshop&opportunity_id=opp-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.context.fingerprint).toBe("fp-1");
    expect(body.rendered).toBeUndefined();
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      task: "resume_workshop", opportunityId: "opp-1",
    }));
  });

  test("?render=1 attaches rendered text + section list", async () => {
    const response = await GET(new Request("http://localhost/api/coach/context?task=resume_workshop&render=1"));
    const body = await response.json();
    expect(body.rendered).toEqual(expect.objectContaining({
      text: expect.stringContaining("JD 内容"),
      sections: expect.arrayContaining([expect.objectContaining({ refId: "jd" })]),
      usedTokens: 100,
    }));
    expect(renderContextForPrompt).toHaveBeenCalledWith(expect.anything(), { excludeKinds: undefined });
  });
});

describe("coach context POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    (getContextBundleForUser as jest.Mock).mockResolvedValue(stubBundle());
    (renderContextForPrompt as jest.Mock).mockReturnValue(stubRendered());
  });

  test("rejects bad JSON", async () => {
    const response = await POST(new Request("http://localhost/api/coach/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    }));
    expect(response.status).toBe(400);
  });

  test("rejects unknown tasks", async () => {
    const response = await POST(new Request("http://localhost/api/coach/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "bogus" }),
    }));
    expect(response.status).toBe(400);
  });

  test("compiles bundle with attachments + questionSource + currentInput", async () => {
    const response = await POST(new Request("http://localhost/api/coach/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "mock_interview",
        opportunityId: "opp-1",
        questionSource: { id: "q1", text: "题目", version: "v3" },
        currentInput: "候选人回答",
        attachments: [
          { id: "job-description", label: "JD", text: "JD 内容", required: true },
          { id: "resume-text", label: "简历", text: "简历内容", required: false },
        ],
        budget: { maxInputTokens: 12_000 },
        planVersion: 4,
        intent: "interview-prep",
        deadline: "2026-09-10T00:00:00Z",
        render: true,
        excludeKinds: ["question_source", "current_input"],
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      task: "mock_interview",
      opportunityId: "opp-1",
      questionSource: { id: "q1", text: "题目", version: "v3" },
      currentInput: "候选人回答",
      attachments: [
        expect.objectContaining({ id: "job-description", text: "JD 内容", required: true }),
        expect.objectContaining({ id: "resume-text", text: "简历内容", required: false }),
      ],
      budget: { maxInputTokens: 12_000 },
      planVersion: 4,
      intent: "interview-prep",
      deadline: "2026-09-10T00:00:00Z",
    }));
    // render=true → 渲染器被调用，且 excludeKinds 透传
    expect(renderContextForPrompt).toHaveBeenCalledWith(expect.anything(), {
      excludeKinds: ["question_source", "current_input"],
    });
    expect(body.rendered.text).toContain("JD 内容");
  });

  test("ignores empty attachment texts", async () => {
    const response = await POST(new Request("http://localhost/api/coach/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "resume_workshop",
        attachments: [
          { id: "empty", label: "空", text: "   " },
          { id: "ok", label: "OK", text: "内容", required: true },
        ],
      }),
    }));
    expect(response.status).toBe(200);
    const callArgs = (getContextBundleForUser as jest.Mock).mock.calls[0][0];
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments[0].id).toBe("ok");
  });

  test("filters invalid excludeKinds values", async () => {
    const response = await POST(new Request("http://localhost/api/coach/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "resume_workshop",
        render: true,
        excludeKinds: ["question_source", "bogus", "confirmed_fact"],
      }),
    }));
    expect(response.status).toBe(200);
    expect(renderContextForPrompt).toHaveBeenCalledWith(expect.anything(), {
      excludeKinds: ["question_source", "confirmed_fact"],
    });
  });

  test("returns 500 when getContextBundleForUser throws", async () => {
    (getContextBundleForUser as jest.Mock).mockRejectedValue(new Error("DB 炸了"));
    const response = await POST(new Request("http://localhost/api/coach/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "resume_workshop" }),
    }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("DB 炸了");
  });
});