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
  analysisData?: AnalysisData;
};

type AnalysisData = {
  targetJob?: string;
  keyCapabilities?: string[];
  projects?: Array<{ name: string; description: string }>;
  resumeSuggestions?: string;
  interviewSuggestions?: string;
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

function buildSystemPromptWithOnboarding(onboarding?: Collected["onboarding"], currentStage?: string) {
  const stages = {
    "职业规划": "引导用户明确职业方向，确定目标岗位",
    "项目梳理": "按照STAR格式帮助用户梳理项目经历，深挖细节",
    "简历优化": "提供简历填写或优化建议",
    "投递策略": "制定简历投递策略",
    "面试辅导": "进行模拟面试并给出回答建议",
    "谈薪策略": "制定薪资谈判策略",
    "Offer": "offer阶段准备"
  };
  
  const stageInstruction = currentStage && stages[currentStage as keyof typeof stages] 
    ? `当前阶段：【${currentStage}】。${stages[currentStage as keyof typeof stages]}。` 
    : "";
  
  const basePrompt = "你是深谙中国就业市场的资深职业顾问，尤其熟悉头部科技企业与国有企业领域。需具备同理心强、沟通温和、专业度高、逻辑清晰的特质。请严格按以下步骤引导用户求职，每步衔接需自然：1. 职业规划指导2. 经历与技能梳理提炼3. 作品集指导4. 简历优化5. 投递策略指导6. 了解用户投递细节与岗位描述7. 结合经历与岗位描述模拟面试8. 用户在真实面试（多轮）后带领复盘9. 获offer后协助选择与薪资谈判引导时需满足：- 多提细节问题，收集充足信息以提供帮助- 语气鼓励引导，适配用户语气与效率偏好- 输出简洁（理想50字内），需深度分析时除外- 信息充足或用户提示时自动进入下一步- 避免重复内容，肯定与引导语需多样- 遇不了解的内容如实说明，向用户索要补充信息- 必要时将话题拉回求职相关请从职业规划指导切入，询问用户职业方向、兴趣点与目标。";
  
  if (!onboarding || typeof onboarding !== 'object') return basePrompt + (stageInstruction ? `\n\n${stageInstruction}` : "");
  
  const contextParts: string[] = [];
  const identity = onboarding.identity || onboarding?.身份;
  const roleKnown = onboarding.intentKnown;
  const role = onboarding.intentRole;
  const stage = onboarding.stage;
  
  if (identity) contextParts.push(`用户身份：${identity}`);
  if (roleKnown === "已确定" && role) contextParts.push(`意向岗位：${role}`);
  if (stage) contextParts.push(`当前阶段：${stage}`);
  
  const contextStr = contextParts.length > 0 ? `用户背景信息：${contextParts.join("，")}。` : "";
  
  return `${basePrompt}${stageInstruction ? `\n\n${stageInstruction}` : ""}${contextStr ? `\n\n${contextStr}请基于这些信息提供个性化建议。` : ""}`;
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

async function callDeepSeek(messages: Message[], functionMode: 'chat' | 'analysis' = 'chat'): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  console.log("API Key exists?", !!apiKey);

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
      max_tokens: functionMode === 'analysis' ? 1000 : 500,
    });

    return completion.choices[0]?.message?.content || "抱歉，我这边暂时没响应，请稍后再试。";
  } catch (error) {
    console.error("DeepSeek API 调用失败:", error);
    throw error;
  }
}

async function analyzeConversation(messages: Message[], onboarding?: any): Promise<Partial<AnalysisData>> {
  try {
    const conversation = messages.filter(m => m.role !== 'system').map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n');
    
    const analysisPrompt = `基于以下对话内容，提取关键信息并返回JSON格式：
{
  "targetJob": "意向岗位（如已明确）",
  "keyCapabilities": ["能力1", "能力2", "能力3"],
  "projectName": "项目名称（仅最近一个完整STAR项目）",
  "projectDesc": "项目描述（STAR格式摘要）",
  "resumeSuggestions": "简历优化建议（如已到简历阶段）",
  "interviewSuggestions": "面试建议（如已到面试阶段）"
}

只返回JSON，不返回其他文字。如果某项未涉及，返回null或空字符串。`;

    const response = await callDeepSeek([
      { role: "system", content: analysisPrompt },
      { role: "user", content: conversation }
    ], 'analysis');

    // 解析JSON响应
    try {
      const parsed = JSON.parse(response);
      const result: Partial<AnalysisData> = {};
      
      if (parsed.targetJob) result.targetJob = parsed.targetJob;
      if (Array.isArray(parsed.keyCapabilities) && parsed.keyCapabilities.length > 0) {
        result.keyCapabilities = parsed.keyCapabilities;
      }
      if (parsed.projectName && parsed.projectDesc) {
        result.projects = [{ name: parsed.projectName, description: parsed.projectDesc }];
      }
      if (parsed.resumeSuggestions) result.resumeSuggestions = parsed.resumeSuggestions;
      if (parsed.interviewSuggestions) result.interviewSuggestions = parsed.interviewSuggestions;
      
      return result;
    } catch {
      return {};
    }
  } catch (error) {
    console.error("分析对话失败:", error);
    return {};
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
      
      // 每3轮对话后进行智能分析
      let analysisData = sessionData.analysisData || {};
      if (sessionData.messages.length > 6 && sessionData.messages.length % 6 === 1) {
        try {
          const newAnalysis = await analyzeConversation(sessionData.messages, currentOnboarding);
          // 合并分析数据
          if (newAnalysis.projects) {
            const existingProjects = analysisData.projects || [];
            const newProjects = [...existingProjects, ...newAnalysis.projects];
            analysisData.projects = newProjects.slice(0, 5); // 限制最多5个
          }
          analysisData = { ...analysisData, ...newAnalysis };
          sessionData.analysisData = analysisData;
        } catch (e) {
          console.error("分析失败:", e);
        }
      }
      
      return NextResponse.json({
        sessionId,
        reply: aiReply,
        analysisData: Object.keys(analysisData).length > 0 ? analysisData : undefined,
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
