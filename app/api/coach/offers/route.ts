import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { deleteOffer, listOffers, saveOffer, type OfferTerms } from "@/lib/coach-harness/plans";

export const runtime = "nodejs";

/**
 * offer 条款 CRUD（PRD §3.1 谈薪入口 / §6.1 薪酬条款）。
 *
 * 条款逐项记录、缺项显示未知；不做跨币种合计，不生成市场分位
 * （本期无可靠行情来源，PRD 明令不猜测）。
 */

const KNOWN_TERM_KEYS = new Set([
  "currency", "payCycle", "grossOrNet", "base", "bonus", "equity",
  "termMonths", "probation", "deadline", "source", "unknowns",
]);

function normalizeTerms(raw: unknown): OfferTerms {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const unknowns = Array.isArray(value.unknowns) ? value.unknowns.filter((u): u is string => typeof u === "string") : [];
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    currency: strOrNull(value.currency),
    payCycle: value.payCycle === "monthly" || value.payCycle === "annual" ? value.payCycle : null,
    grossOrNet: value.grossOrNet === "gross" || value.grossOrNet === "net" ? value.grossOrNet : "unknown",
    base: numOrNull(value.base),
    bonus: numOrNull(value.bonus),
    equity: strOrNull(value.equity),
    termMonths: numOrNull(value.termMonths),
    probation: strOrNull(value.probation),
    deadline: strOrNull(value.deadline),
    source: strOrNull(value.source),
    // 请求里出现的未知字段也算「待确认缺项」，如实记录而不是丢弃
    unknowns: [...new Set([
      ...unknowns,
      ...Object.keys(value).filter((key) => !KNOWN_TERM_KEYS.has(key)).map((key) => `未识别字段：${key}`),
    ])],
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const url = new URL(request.url);
  const opportunityId = url.searchParams.get("opportunity_id") || undefined;
  try {
    const offers = await listOffers(user.id, opportunityId);
    return NextResponse.json({ ok: true, offers });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "读取 offer 失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const opportunityId = typeof body.opportunityId === "string" ? body.opportunityId : "";
  if (!opportunityId) {
    return NextResponse.json(
      { ok: false, error: "opportunityId 必填——offer 必须挂在具体岗位上（谈薪准备本身不需要 JD 内容）" },
      { status: 400 },
    );
  }
  try {
    const offer = await saveOffer({
      userId: user.id,
      opportunityId,
      offerId: typeof body.offerId === "string" ? body.offerId : null,
      terms: normalizeTerms(body.terms),
      priorities: Array.isArray(body.priorities)
        ? (body.priorities as unknown[]).filter((p): p is string => typeof p === "string")
        : [],
      status: typeof body.status === "string"
        && ["received", "comparing", "negotiating", "accepted", "declined", "expired"].includes(body.status)
        ? body.status as "received"
        : undefined,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ ok: true, offer });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "保存 offer 失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const url = new URL(request.url);
  const offerId = url.searchParams.get("offer_id");
  if (!offerId) return NextResponse.json({ ok: false, error: "offer_id 必填" }, { status: 400 });
  try {
    const deleted = await deleteOffer(user.id, offerId);
    if (!deleted) return NextResponse.json({ ok: false, error: "offer 不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, deletedId: offerId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 },
    );
  }
}
