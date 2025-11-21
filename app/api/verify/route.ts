import { NextResponse } from "next/server";
import { getCachedCode, clearCachedCode } from "../sms/route";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const phone = body?.phone as string | undefined;
    const code = body?.code as string | undefined;

    if (!phone || !code) {
      return NextResponse.json({ success: false, msg: "缺少手机号或验证码" }, { status: 400 });
    }

    const cached = getCachedCode(phone);
    if (cached && cached === code) {
      clearCachedCode(phone);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, msg: "验证码错误或已过期" });
  } catch (error) {
    console.error("验证码校验失败:", error);
    return NextResponse.json({ success: false, msg: "服务器错误" }, { status: 500 });
  }
}


