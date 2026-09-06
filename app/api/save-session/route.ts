import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

// 必须使用 Node.js runtime（因为需要数据库操作）
export const runtime = "nodejs";

/**
 * ⚠️ legacy 接口：不做任何持久化。
 *
 * 历史上这个接口只 console.log 后就返回 "会话已保存"，落库失败（甚至根本没有落库）
 * 调用方也收到成功响应——这正是 PRD 明令禁止的假保存。在接入真正的会话表之前，
 * 如实返回 501，绝不谎报"已保存"。
 */
export async function POST(req: Request) {
  const auth = await getCurrentUserFromRequest();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  }

  // 校验请求体仍然保留，让调用方能尽早发现参数问题
  try {
    const body = await req.json();
    if (!body?.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { ok: false, error: "messages 字段缺失或格式不正确" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "会话持久化未实现：该接口从不写入数据库，历史版本返回的「会话已保存」是假成功。请勿依赖此接口保存会话。",
    },
    { status: 501 }
  );
}
