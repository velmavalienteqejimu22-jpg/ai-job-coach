import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { validateArtifactDraft } from "@/lib/coach-harness";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness", () => ({
  validateArtifactDraft: jest.fn(),
}));
jest.mock("@/lib/coach-harness/repository", () => ({
  getContextBundleForUser: jest.fn(),
}));

const stubBundle = () => ({
  version: 2,
  fingerprint: "fpx",
  budget: { maxInputTokens: 12_000 },
  usage: { usedTokens: 800, truncated: false },
  selection: { included: [], excluded: [{ kind: "confirmed_fact", refId: "dropped-1", reason: "lower_priority", rule: "excluded:lower_priority", priority: 4, cost: 120, required: false }] },
  allowedClaimIds: ["ok-1"],
  unverifiedClaimIds: ["warn-1"],
  blockedClaimIds: ["bad-1"],
  claims: [],
  blockedClaimDetails: [],
  attachments: [],
  artifacts: [],
  knowledge: [],
});

describe("coach validate POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    (getContextBundleForUser as jest.Mock).mockResolvedValue(stubBundle());
    (validateArtifactDraft as jest.Mock).mockReturnValue({
      ok: true, issues: [], referencedClaimIds: ["ok-1"], checkedAt: "2026-09-05T00:00:00.000Z",
    });
  });

  test("rejects missing task", async () => {
    const response = await POST(new Request("http://localhost/api/coach/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: {} }),
    }));
    expect(response.status).toBe(400);
  });

  test("returns report + context summary so UI can show selection state", async () => {
    const response = await POST(new Request("http://localhost/api/coach/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "resume_workshop",
        opportunityId: "opp-1",
        draft: { artifactType: "target_resume", visibility: "recruiter_safe", sections: [] },
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.contextFingerprint).toBe("fpx");
    expect(body.context).toEqual(expect.objectContaining({
      usedTokens: 800,
      budget: 12_000,
      truncated: false,
      included: 0,
      excluded: 1,
      allowedClaimIds: ["ok-1"],
      unverifiedClaimIds: ["warn-1"],
      blockedClaimIds: ["bad-1"],
    }));
    expect(validateArtifactDraft).toHaveBeenCalled();
  });

  test("passes attachments + questionSource through to the bundle", async () => {
    const response = await POST(new Request("http://localhost/api/coach/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "resume_workshop",
        opportunityId: "opp-1",
        questionSource: { id: "qs", text: "题目" },
        currentInput: "当前输入",
        attachments: [
          { id: "jd", label: "JD", text: "JD 内容", required: true },
        ],
        draft: { artifactType: "target_resume", visibility: "recruiter_safe", sections: [] },
      }),
    }));
    expect(response.status).toBe(200);
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      questionSource: { id: "qs", text: "题目", version: null },
      currentInput: "当前输入",
      attachments: [expect.objectContaining({ id: "jd", text: "JD 内容", required: true })],
    }));
  });

  test("does NOT fail-loud on truncated context (validate only reports)", async () => {
    // validate 不写库也不调 LLM，validateArtifactDraft 会把缺漏的 claim 报成
    // unknown_claim——这本身就是用户该看的信号。
    (getContextBundleForUser as jest.Mock).mockResolvedValue({
      ...stubBundle(),
      usage: { usedTokens: 11_900, truncated: true },
    });
    const response = await POST(new Request("http://localhost/api/coach/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "resume_workshop",
        draft: { artifactType: "target_resume", visibility: "recruiter_safe", sections: [] },
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.context.truncated).toBe(true);
  });
});