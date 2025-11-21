import { NextResponse } from "next/server";
import { saveWhiteboard } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, whiteboard } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId 是必需的" },
        { status: 400 }
      );
    }

    await saveWhiteboard(sessionId, whiteboard || {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("保存白板数据失败:", error);
    return NextResponse.json(
      {
        error: "保存白板数据失败",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

