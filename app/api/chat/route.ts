import { NextResponse } from "next/server";
import { UserStage, StageNames, StageDescriptions, getNextStage, isValidStage } from "@/lib/stage";
import { saveMessage, setUserStage } from "@/lib/db";
import { runOrchestrator } from "@/lib/orchestrator";

type RequestBody = {
  message?: string;
  userStage?: UserStage | string;
  allHistory?: Array<{
    role: "user" | "assistant";
    content: string;
    stage?: UserStage;
  }>;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  userState?: {
    currentStage?: string;
    identity?: string;
    [key: string]: any;
  };
  userId?: string;
  sessionId?: string;
};

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AIResponse = {
  assistant_response: string;
  stage_evaluation: {
    should_advance: boolean;
    reason: string;
    next_stage?: string;
  };
};

export async function POST(request: Request) {
  // 先读取 request body（只能读取一次）
  let requestBody: RequestBody = {};
  try {
    requestBody = await request.json();
  } catch {
    requestBody = {};
  }
  
  try {
    const { message, userStage, allHistory = [], history = [], userState, userId, sessionId } = requestBody;

    // 验证并规范化 userStage
    let currentStage: UserStage = "career_planning"; // 默认阶段
    if (userStage && isValidStage(userStage)) {
      currentStage = userStage;
    } else if (typeof userStage === "string") {
      // 尝试映射旧阶段名称
      const stageMap: Record<string, UserStage> = {
        career: "career_planning",
        project: "project_review",
        resume: "resume_optimization",
        apply: "application_strategy",
        interview: "interview",
        offer: "salary_talk",
      };
      currentStage = stageMap[userStage.toLowerCase()] || "career_planning";
    }

    // 构建消息数组（优先使用 allHistory，否则使用 history）
    const orchestratorMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // 优先使用 allHistory（包含所有阶段的对话）
    if (allHistory.length > 0) {
      allHistory.forEach((msg) => {
        // 跳过阶段标记消息（可选，用于帮助AI理解上下文）
        if (!msg.content.startsWith("[阶段切换：")) {
          orchestratorMessages.push({
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content,
          });
        }
      });
    } else if (history.length > 0) {
      // 降级使用 history（当前阶段的对话）
      history.forEach((msg) => {
        orchestratorMessages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      });
    }

    // 添加当前用户消息
    orchestratorMessages.push({
      role: "user",
      content: message || "你好",
    });

    // 使用编排器调用对应的模型
    const orchestratorResult = await runOrchestrator({
      userStage: currentStage,
      messages: orchestratorMessages,
    });

    // 检查是否需要推进阶段（简单判断：用户明确表达完成）
    const userMessageLower = (message || "").toLowerCase();
    const shouldAdvance = 
      userMessageLower.includes("完成了") ||
      userMessageLower.includes("继续下一步") ||
      userMessageLower.includes("可以了") ||
      userMessageLower.includes("准备好了");

    let nextStageValue: UserStage = currentStage;
    if (shouldAdvance) {
      const nextStage = getNextStage(currentStage);
      if (nextStage) {
        nextStageValue = nextStage;
      }
    }

    const responseData = {
      reply: orchestratorResult.reply,
      structured: orchestratorResult.structured, // 白板数据结构
      shouldAdvance,
      nextStage: nextStageValue,
      stageEvaluation: {
        reason: shouldAdvance ? "用户表示已完成当前阶段" : "继续当前阶段",
      },
    };

    console.log("API 返回数据:", JSON.stringify(responseData, null, 2));

    // 异步保存消息和阶段（不阻塞响应）
    if (sessionId && userId) {
      Promise.all([
        // 保存用户消息
        saveMessage(sessionId, 'user', message || '', currentStage).catch(err => 
          console.error('保存用户消息失败:', err)
        ),
        // 保存 AI 回复
        saveMessage(sessionId, 'assistant', orchestratorResult.reply, currentStage).catch(err => 
          console.error('保存 AI 消息失败:', err)
        ),
        // 如果阶段推进，更新用户阶段
        shouldAdvance && nextStageValue !== currentStage
          ? setUserStage(userId, nextStageValue).catch(err => 
              console.error('更新用户阶段失败:', err)
            )
          : Promise.resolve(),
      ]).catch(err => {
        console.error('保存数据时发生错误:', err);
        // 不抛出错误，避免影响响应
      });
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("API 处理错误:", error);
    console.error("错误详情:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // 获取当前阶段（用于错误响应）
    let currentStage: UserStage = "career_planning";
    if (requestBody.userStage && isValidStage(requestBody.userStage)) {
      currentStage = requestBody.userStage;
    }
    
    // 提供更友好的错误消息
    let errorMessage = "抱歉，处理你的请求时出现了错误。请稍后再试。";
    
    if (error.message?.includes("API_KEY")) {
      errorMessage = "API Key 未配置或无效，请检查 .env.local 文件中的 DEEPSEEK_API_KEY 配置。";
    } else if (error.message?.includes("配额") || error.message?.includes("quota")) {
      errorMessage = "API 配额不足，请检查账户余额。";
    } else if (error.message?.includes("超时") || error.message?.includes("timeout")) {
      errorMessage = "请求超时，请稍后重试。";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { 
        reply: errorMessage,
        shouldAdvance: false,
        nextStage: currentStage,
        stageEvaluation: {
          reason: "发生错误，无法评估阶段",
        },
      },
      { status: 500 }
    );
  }
}

