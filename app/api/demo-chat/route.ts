// app/api/demo-chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type SessionData = {
  messages: Message[];
  createdAt: Date;
};

type Body = {
  sessionId?: string;
  message?: string;
  onboarding?: any;
};

type Collected = {
  onboarding?: any;
};

type ExtendedSessionData = SessionData & { collected?: Collected };

const SESSIONS = new Map<string, ExtendedSessionData>();

function makeId(len = 8) {
  const s = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < len; i++) r += s[Math.floor(Math.random() * s.length)];
  return r;
}

function buildSystemPromptWithOnboarding(onboarding?: Collected["onboarding"]) {
  const basePrompt = "你是一位语气温和、逻辑清晰的 AI 求职教练，用简短提问引导用户反思项目或面试准备。每次回复不超过两段。语气自然，像柏拉图式对话。";
  
  if (!onboarding || typeof onboarding !== 'object') return basePrompt;
  
  const contextParts: string[] = [];
  const identity = onboarding.identity || onboarding?.身份;
  const roleKnown = onboarding.intentKnown;
  const role = onboarding.intentRole;
  const stage = onboarding.stage;
  
  if (identity) contextParts.push(`用户身份：${identity}`);
  if (roleKnown === "已确定" && role) contextParts.push(`意向岗位：${role}`);
  if (stage) contextParts.push(`当前阶段：${stage}`);
  
  if (contextParts.length > 0) {
    return `${basePrompt}\n\n用户背景信息：${contextParts.join("，")}。请基于这些信息提供个性化建议。`;
  }
  
  return basePrompt;
}

function initialAssistant(personal?: Collected["onboarding"]) {
  if (personal && typeof personal === 'object') {
    const identity = personal.identity || personal?.身份;
    const roleKnown = personal.intentKnown;
    const role = personal.intentRole;
    const stage = personal.stage;
    const parts: string[] = [];
    
    if (identity) parts.push(`你是${identity}`);
    if (roleKnown === "已确定" && role) parts.push(`意向${role}`);
    
    const prefix = parts.length ? `${parts.join("，")}，` : "";
    
    // 根据阶段提供更精准的初始建议
    let stageAdvice = "";
    if (stage === "还没写简历") {
      stageAdvice = "我先帮你梳理项目经历，为写简历做准备。";
    } else if (stage === "简历已写好也比较满意") {
      stageAdvice = "简历不错！我们重点准备面试，提升你的表达和应变能力。";
    } else if (stage === "面试ing") {
      stageAdvice = "面试进行中，我来帮你复盘和优化回答策略。";
    } else if (stage === "准备谈薪") {
      stageAdvice = "到了谈薪环节，我帮你制定薪资谈判策略。";
    } else if (stage === "已offer，随便看看") {
      stageAdvice = "恭喜拿到 offer！有什么职场问题随时问我。";
    }
    
    return `${prefix}你好！我是你的 AI 求职教练。${stageAdvice}先从你最关心的一点开始：想从简历还是面试切入？`;
  }
  return `你好！我是你的 AI 求职教练。我们以简短的问答来推进，你可以简短回答，我会一步步引导。首先：你目前是在找【实习】、【秋招】还是【社招】？（只需回答一词）`;
}

async function callDeepSeek(messages: Message[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY not found");
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    return completion.choices[0]?.message?.content || "抱歉，我这边暂时没响应，请稍后再试。";
  } catch (error) {
    console.error("DeepSeek API 调用失败:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body: Body = await request.json().catch(() => ({}));
    let { sessionId, message, onboarding } = body;

    if (!sessionId) {
      // 创建新会话
      sessionId = makeId();
      const systemPrompt = buildSystemPromptWithOnboarding(onboarding);
      const initialMessages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: initialAssistant(onboarding) }
      ];
      
      SESSIONS.set(sessionId, {
        messages: initialMessages,
        createdAt: new Date(),
        collected: { onboarding },
      });

      return NextResponse.json({
        sessionId,
        reply: initialAssistant(onboarding),
        personalizationTip: onboarding?.identity ? `已基于你的身份：${onboarding.identity}，为你定制化建议` : undefined,
      });
    }

    // 获取现有会话
    let sessionData = SESSIONS.get(sessionId);
    if (!sessionData) {
      // 会话不存在，创建新会话
      sessionId = makeId();
      const systemPrompt = buildSystemPromptWithOnboarding(onboarding);
      const initialMessages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: initialAssistant(onboarding) }
      ];
      
      SESSIONS.set(sessionId, {
        messages: initialMessages,
        createdAt: new Date(),
        collected: { onboarding },
      });

      return NextResponse.json({
        sessionId,
        reply: initialAssistant(onboarding),
        personalizationTip: onboarding?.identity ? `已基于你的身份：${onboarding.identity}，为你定制化建议` : undefined,
      });
    }

    // 若本次带有 onboarding，则 merge 进 session.collected
    if (onboarding) {
      const existingOnboarding = sessionData.collected?.onboarding || {};
      const mergedOnboarding = { ...existingOnboarding, ...onboarding };
      sessionData.collected = { 
        ...(sessionData.collected || {}), 
        onboarding: mergedOnboarding 
      };
      
      // 立即更新系统提示词
      const newSystemPrompt = buildSystemPromptWithOnboarding(mergedOnboarding);
      sessionData.messages[0] = { role: "system", content: newSystemPrompt };
    }

    // 添加用户消息
    if (message) {
      sessionData.messages.push({ role: "user", content: message });
    }

    // 调用 DeepSeek API
    try {
      // 确保系统提示词是最新的（基于当前会话的 onboarding 信息）
      const currentOnboarding = sessionData.collected?.onboarding;
      const updatedSystemPrompt = buildSystemPromptWithOnboarding(currentOnboarding);
      
      // 强制更新系统提示词
      sessionData.messages[0] = { role: "system", content: updatedSystemPrompt };
      
      console.log("=== DEBUG INFO ===");
      console.log("Session ID:", sessionId);
      console.log("Current onboarding:", JSON.stringify(currentOnboarding, null, 2));
      console.log("System prompt:", updatedSystemPrompt);
      console.log("User message:", message);
      console.log("Messages count:", sessionData.messages.length);
      console.log("==================");
      
      const aiReply = await callDeepSeek(sessionData.messages);
      
      // 添加 AI 回复到会话历史
      sessionData.messages.push({ role: "assistant", content: aiReply });
      
      return NextResponse.json({
        sessionId,
        reply: aiReply,
      });
    } catch (error) {
      console.error("DeepSeek API 调用失败:", error);
      return NextResponse.json({
        sessionId,
        reply: "抱歉，我这边暂时没响应，请稍后再试。",
      });
    }
  } catch (error) {
    console.error("API 处理错误:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
