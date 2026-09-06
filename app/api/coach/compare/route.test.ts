import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getContextBundleForUser, requireDb } from "@/lib/coach-harness/repository";
import { renderContextForPrompt } from "@/lib/coach-harness/prompt";
import { callLLM } from "@/lib/llm";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/coach-harness/repository", () => ({
  getContextBundleForUser: jest.fn(),
  requireDb: jest.fn(),
}));
jest.mock("@/lib/coach-harness/prompt", () => ({
  assertContextFits: jest.fn(),
  renderContextForPrompt: jest.fn(),
}));
jest.mock("@/lib/llm");

const USER = "00000000-0000-4000-8000-000000000001";
const OPP_A = "00000000-0000-4000-8000-000000000002";
const OPP_B = "00000000-0000-4000-8000-000000000003";

const oppRow = (id: string, company: string, jdText: string | null) => ({
  id, company, role: "AI PM", stage: "interviewing",
  jd_text: jdText, scheduled_interview_at: null, metadata: {},
});

const bundleStub = {
  version: 2,
  usage: { usedTokens: 1500, truncated: false },
  selection: {
    included: [],
    excluded: [{ kind: "attachment", refId: `jd-${OPP_B}`, rule: "excluded:lower_priority" }],
  },
};

function request(body: unknown) {
  return new Request("http://localhost/api/coach/compare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("compare POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    const single = (row: unknown) => async () => ({ data: row, error: null });
    (requireDb as jest.Mock).mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: single(oppRow(OPP_A, "字节", "AI PM JD 全文")) }) }) }) })
        .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: single(oppRow(OPP_B, "另一家", null)) }) }) }) }),
    });
    (getContextBundleForUser as jest.Mock).mockResolvedValue(bundleStub);
    (renderContextForPrompt as jest.Mock).mockReturnValue({ text: "", sections: [], usedTokens: 1500, truncated: false, warnings: [] });
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      comparison: [{ company: "字节", requirements: ["RAG"], matches: ["项目匹配"], risks: ["轮次紧"], nextStep: "补案例" }],
    }));
  });

  test("只比较选中岗位，excluded 能定位到哪份 JD 被预算舍弃", async () => {
    const response = await POST(request({ opportunityIds: [OPP_A, OPP_B] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.table).toHaveLength(2);
    expect(body.table[1].hasJd).toBe(false); // 无 JD 岗位如实标注，不阻塞比较
    expect(body.contextSummary.excluded[0].refId).toBe(`jd-${OPP_B}`);
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      selectedOpportunityIds: [OPP_A, OPP_B],
    }));
  });

  test("少于 2 个岗位返回 400", async () => {
    const response = await POST(request({ opportunityIds: [OPP_A] }));
    expect(response.status).toBe(400);
  });

  test("别人的岗位返回 404，不进入比较", async () => {
    (requireDb as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      }),
    });
    const response = await POST(request({ opportunityIds: [OPP_A, OPP_B] }));
    expect(response.status).toBe(404);
  });

  test("prompt 中声明不产出匹配分", async () => {
    const response = await POST(request({ opportunityIds: [OPP_A, OPP_B] }));
    expect(response.status).toBe(200);
    const [messages] = (callLLM as jest.Mock).mock.calls[0];
    expect(messages[0].content).toContain("不产出任何数字形式的「匹配分」");
  });
});
