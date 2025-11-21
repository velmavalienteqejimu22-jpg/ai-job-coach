/**
 * 模拟面试模型
 */

import { callLLM } from "@/lib/llm";
import { INTERVIEW_SYSTEM_PROMPT } from "../prompts/interview";

export type InterviewResult = {
  reply: string;
  structured: {
    interviewReports?: Array<{
      id: string;
      round: string;
      questions?: Array<{
        question: string;
        userAnswer?: string;
        aiFeedback?: string;
        score?: number;
      }>;
      overallScore?: number;
      strengths?: string[];
      improvements?: string[];
    }>;
  };
};

export async function runDeepSeekInterview(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<InterviewResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: INTERVIEW_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 1000,
    provider: "deepseek",
  });

  // 解析回复，提取面试报告
  const structured: InterviewResult["structured"] = {};

  // 尝试从对话中提取面试信息
  const allText = messages.map(m => m.content).join(" ") + " " + response;
  
  // 检查是否完成了一轮面试（简单判断：包含多个问题和回答）
  const questionCount = (allText.match(/(?:问题|Q|问)[：:，,]/gi) || []).length;
  const answerCount = (allText.match(/(?:回答|答)[：:，,]/gi) || []).length;

  if (questionCount >= 2 && answerCount >= 1) {
    structured.interviewReports = [{
      id: `interview_${Date.now()}`,
      round: "第一轮：技术面试",
      overallScore: 80, // 默认分数
      strengths: ["表达清晰"],
      improvements: ["可以增加更多具体案例"],
    }];
  }

  return {
    reply: response,
    structured,
  };
}

