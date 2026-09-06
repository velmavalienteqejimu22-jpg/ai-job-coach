import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getOffer } from "@/lib/coach-harness/plans";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import { renderContextForPrompt } from "@/lib/coach-harness/prompt";
import { callLLM } from "@/lib/llm";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/plans", () => ({
  getOffer: jest.fn(),
}));
jest.mock("@/lib/coach-harness/repository", () => ({
  getContextBundleForUser: jest.fn(),
}));
jest.mock("@/lib/coach-harness/prompt", () => ({
  assertContextFits: jest.fn(),
  renderContextForPrompt: jest.fn(),
  ContextBudgetExceededError: class extends Error {
    blocked: Array<Record<string, unknown>>;
    constructor(message: string, blocked: Array<Record<string, unknown>> = []) {
      super(message);
      this.blocked = blocked;
    }
  },
}));
jest.mock("@/lib/llm");

const USER = "00000000-0000-4000-8000-000000000001";
const OPP = "00000000-0000-4000-8000-000000000002";
const OFFER_ID = "00000000-0000-4000-8000-000000000005";

const offerStub = {
  id: OFFER_ID,
  opportunityId: OPP,
  terms: { base: 30000, currency: "CNY", equity: null, deadline: "2026-09-10", unknowns: ["equity", "试用期条款"] },
  priorities: ["现金", "成长空间"],
  status: "received",
  notes: null,
  createdAt: "", updatedAt: "",
};

const bundleStub = {
  version: 2,
  usage: { usedTokens: 900, truncated: false },
  selection: { included: [], excluded: [] },
};

function request(body: unknown) {
  return new Request("http://localhost/api/coach/negotiation-draft", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("negotiation draft POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (getOffer as jest.Mock).mockResolvedValue(offerStub);
    (getContextBundleForUser as jest.Mock).mockResolvedValue(bundleStub);
    (renderContextForPrompt as jest.Mock).mockReturnValue({ text: "", sections: [], usedTokens: 900, truncated: false, warnings: [] });
  });

  test("prompt 包含条款原文与未知项，系统提示禁止编造市场行情", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      questions: ["期权行权价和稀释比例是什么？"], draft: "您好，想确认…", tradeoffs: ["现金优先"],
    }));
    const response = await POST(request({ offerId: OFFER_ID }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(1);
    expect(body.contextSummary.excluded).toEqual([]);
    const [messages] = (callLLM as jest.Mock).mock.calls[0];
    expect(messages[1].content).toContain("【我的 offer 条款】");
    expect(messages[1].content).toContain("equity"); // 未知项进入 prompt
    expect(messages[0].content).toContain("不能编造数字");
    expect(messages[0].content).toContain("不生成任何「市场薪资」");
  });

  test("offerId 缺失返回 400", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
  });

  test("offer 不存在返回 404", async () => {
    (getOffer as jest.Mock).mockResolvedValue(null);
    const response = await POST(request({ offerId: OFFER_ID }));
    expect(response.status).toBe(404);
  });

  test("模型返回缺 draft 时 502，不静默兜底", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ questions: ["只有问题"] }));
    const response = await POST(request({ offerId: OFFER_ID }));
    expect(response.status).toBe(502);
  });

  test("模型 JSON 解析失败返回 502", async () => {
    (callLLM as jest.Mock).mockResolvedValue("抱歉，我无法完成");
    const response = await POST(request({ offerId: OFFER_ID }));
    expect(response.status).toBe(502);
  });
});
