/**
 * 投递策略模型
 */

import { callLLM } from "@/lib/llm";
import { APPLICATION_STRATEGY_SYSTEM_PROMPT } from "../prompts/application_strategy";

export type ApplicationStrategyResult = {
  reply: string;
  structured: {
    targetCompanies?: Array<{
      name: string;
      position: string;
      matchScore?: number;
      notes?: string;
    }>;
  };
};

export async function runDeepSeekStrategy(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<ApplicationStrategyResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: APPLICATION_STRATEGY_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 600,
    provider: "deepseek",
  });

  // 解析回复，提取目标公司
  const structured: ApplicationStrategyResult["structured"] = {};

  // 尝试从对话中提取公司名称
  const companyPatterns = [
    /(?:公司|企业)[：:，,]?([^，。\n]{2,20})/gi,
    /(?:想投|目标).*?([^，。\n]{2,20})/gi,
  ];

  const companies: Array<{
    name: string;
    position: string;
    matchScore?: number;
    notes?: string;
  }> = [];

  for (const pattern of companyPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 1) {
        const name = match[1].trim();
        if (!companies.some(c => c.name === name)) {
          companies.push({
            name,
            position: "待定",
            matchScore: 80, // 默认匹配度
          });
        }
      }
    }
  }

  if (companies.length > 0) {
    structured.targetCompanies = companies;
  }

  return {
    reply: response,
    structured,
  };
}

