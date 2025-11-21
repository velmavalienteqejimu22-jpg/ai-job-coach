import { NextResponse } from "next/server";
import {
  getOrCreateUser,
  getLatestSession,
  createSession,
  getMessages,
  getWhiteboard,
  getUserStage,
} from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, sessionId } = body;

    // 如果没有 userId，创建新用户
    let finalUserId = userId;
    if (!finalUserId) {
      // 从请求中获取用户标识（如果有）
      const phone = body.phone || null;
      const email = body.email || null;
      finalUserId = await getOrCreateUser(phone, email);
      
      // 如果数据库不可用，返回空响应，让前端使用 localStorage
      if (!finalUserId) {
        return NextResponse.json({
          userId: null,
          sessionId: null,
          messages: [],
          whiteboard: {},
          currentStage: 'career_planning',
          useLocalStorage: true, // 标记使用 localStorage
        });
      }
    }

    // 获取或创建会话
    let finalSessionId = sessionId;
    if (!finalSessionId) {
      // 尝试获取最新会话
      finalSessionId = await getLatestSession(finalUserId);
      
      // 如果没有会话，创建新会话
      if (!finalSessionId) {
        finalSessionId = await createSession(finalUserId);
        
        // 如果数据库不可用，返回空响应
        if (!finalSessionId) {
          return NextResponse.json({
            userId: finalUserId,
            sessionId: null,
            messages: [],
            whiteboard: {},
            currentStage: 'career_planning',
            useLocalStorage: true,
          });
        }
      }
    }

    // 并行加载所有数据
    const [messages, whiteboard, currentStage] = await Promise.all([
      getMessages(finalSessionId),
      getWhiteboard(finalSessionId),
      getUserStage(finalUserId),
    ]);

    // 转换消息格式以匹配前端
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      content: msg.content,
      isUser: msg.role === 'user',
      timestamp: new Date(msg.created_at),
    }));

    return NextResponse.json({
      userId: finalUserId,
      sessionId: finalSessionId,
      messages: formattedMessages,
      whiteboard: whiteboard || {},
      currentStage: currentStage || 'career_planning',
    });
  } catch (error: any) {
    console.error("加载会话失败:", error);
    // 如果数据库不可用，返回空响应而不是错误
    return NextResponse.json({
      userId: null,
      sessionId: null,
      messages: [],
      whiteboard: {},
      currentStage: 'career_planning',
      useLocalStorage: true,
    });
  }
}

