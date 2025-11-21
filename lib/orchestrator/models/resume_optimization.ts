/**
 * 简历优化模型
 */

import { callLLM } from "@/lib/llm";
import { RESUME_OPTIMIZATION_SYSTEM_PROMPT } from "../prompts/resume_optimization";

export type ResumeOptimizationResult = {
  reply: string;
  structured: {
    resumeInsights?: Array<{
      id: string;
      original?: string;
      optimized?: string;
      suggestion?: string;
      section?: string;
    }>;
  };
};

export async function runDeepSeekResume(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<ResumeOptimizationResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: RESUME_OPTIMIZATION_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 800,
    provider: "deepseek",
  });

  // 解析回复，提取优化建议
  const structured: ResumeOptimizationResult["structured"] = {};

  // 尝试从回复中提取原句和优化句
  const originalMatch = response.match(/(?:原句|原文)[：:，,]?([^，。\n]+)/i);
  const optimizedMatch = response.match(/(?:优化|改进)[：:，,]?([^，。\n]+)/i);
  const suggestionMatch = response.match(/(?:建议|原因)[：:，,]?([^，。\n]+)/i);

  if (originalMatch || optimizedMatch) {
    structured.resumeInsights = [{
      id: `insight_${Date.now()}`,
      original: originalMatch?.[1]?.trim(),
      optimized: optimizedMatch?.[1]?.trim(),
      suggestion: suggestionMatch?.[1]?.trim() || "优化建议",
      section: "工作经历", // 默认，可以从对话中提取
    }];
  }

  return {
    reply: response,
    structured,
  };
}

