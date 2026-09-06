import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";

// 必须使用 Node.js runtime（因为需要数据库操作）
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await getCurrentUserFromRequest();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  }
  const user = { id: auth.id, email: auth.email };

  const { data } = await req.json();

  if (!data) {
    return NextResponse.json({ ok: false, error: "data 字段缺失" }, { status: 400 });
  }

  // 阻止前端提交 key
  if (data?.apiKey || data?.key || data?.token) {
    return NextResponse.json(
      { ok: false, error: "Client is not allowed to send LLM keys." },
      { status: 400 }
    );
  }

  try {
    const db = await getDbClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Database not initialized" }, { status: 500 });
    }

    // Supabase 的 upsert 失败不抛异常，错误在返回值里——必须检查，否则
    // 落库失败仍会返回 ok:true（PRD §可解释可回放：保存状态必须如实）。
    const { error } = await db.from("whiteboard_states").upsert({
      user_id: user.id,
      data,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });
    if (error) {
      console.error("save-whiteboard upsert error:", error);
      return NextResponse.json(
        { ok: false, error: `白板保存失败：${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("save-whiteboard error:", err);
    return NextResponse.json({ ok: false, error: "服务器内部错误" }, { status: 500 });
  }
}

