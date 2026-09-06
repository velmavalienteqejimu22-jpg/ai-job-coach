import { DELETE, GET, POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { deleteOffer, listOffers, saveOffer } from "@/lib/coach-harness/plans";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/plans", () => ({
  deleteOffer: jest.fn(),
  listOffers: jest.fn(),
  saveOffer: jest.fn(),
}));

const USER = "00000000-0000-4000-8000-000000000001";
const OPP = "00000000-0000-4000-8000-000000000002";

describe("offers GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (listOffers as jest.Mock).mockResolvedValue([]);
  });

  test("按岗位过滤透传", async () => {
    const response = await GET(new Request(`http://localhost/api/coach/offers?opportunity_id=${OPP}`));
    expect(response.status).toBe(200);
    expect(listOffers).toHaveBeenCalledWith(USER, OPP);
  });
});

describe("offers POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (saveOffer as jest.Mock).mockResolvedValue({
      id: "offer-1", opportunityId: OPP,
      terms: { base: 30000, currency: "CNY", unknowns: ["equity", "未识别字段：stockPrice"] },
      priorities: ["现金"], status: "received", notes: null, createdAt: "", updatedAt: "",
    });
  });

  test("缺项归入 unknowns，未识别字段不丢弃", async () => {
    const response = await POST(new Request("http://localhost/api/coach/offers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId: OPP,
        terms: { base: 30000, currency: "CNY", equity: null, stockPrice: "？?" },
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.offer.terms.unknowns).toContain("equity");
    expect(body.offer.terms.unknowns).toContain("未识别字段：stockPrice");
    expect(saveOffer).toHaveBeenCalledWith(expect.objectContaining({
      terms: expect.objectContaining({ base: 30000, currency: "CNY" }),
    }));
  });

  test("opportunityId 缺失返回 400（offer 必须挂岗位）", async () => {
    const response = await POST(new Request("http://localhost/api/coach/offers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms: { base: 1 } }),
    }));
    expect(response.status).toBe(400);
  });
});

describe("offers DELETE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
  });

  test("真删除：成功返回 deletedId", async () => {
    (deleteOffer as jest.Mock).mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost/api/coach/offers?offer_id=00000000-0000-4000-8000-000000000009"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.deletedId).toBe("00000000-0000-4000-8000-000000000009");
  });

  test("别人的 offer 删除返回 404，不泄漏存在性", async () => {
    (deleteOffer as jest.Mock).mockResolvedValue(false);
    const response = await DELETE(new Request("http://localhost/api/coach/offers?offer_id=00000000-0000-4000-8000-000000000009"));
    expect(response.status).toBe(404);
  });
});
