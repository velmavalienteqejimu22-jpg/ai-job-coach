/**
 * 薪资沟通模型
 */

import { callLLM } from "@/lib/llm";
import { SALARY_TALK_SYSTEM_PROMPT } from "../prompts/salary_talk";

export type SalaryTalkResult = {
  reply: string;
  structured: {
    salaryStrategy?: {
      targetRange?: string;
      negotiationPoints?: string[];
      marketData?: string;
    };
  };
};

export async function runDeepSeekSalary(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<SalaryTalkResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: SALARY_TALK_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 600,
    provider: "deepseek",
  });

  // 解析回复，提取薪资策略
  const structured: SalaryTalkResult["structured"] = {};

  // 尝试从回复中提取薪资范围
  const rangeMatch = response.match(/(?:范围|薪资|期望)[：:，,]?([0-9]+[kK万]?[-~到][0-9]+[kK万]?)/i);
  const points: string[] = [];

  // 提取谈判要点
  const pointPatterns = [
    /(?:要点|策略)[：:，,]([^，。\n]+)/gi,
    /[1-9][\.、]([^，。\n]+)/g,
  ];

  for (const pattern of pointPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 3) {
        points.push(match[1].trim());
      }
    }
  }

  if (rangeMatch || points.length > 0) {
    structured.salaryStrategy = {
      targetRange: rangeMatch?.[1] || undefined,
      negotiationPoints: points.length > 0 ? points : undefined,
      marketData: "市场行情数据",
    };
  }

  return {
    reply: response,
    structured,
  };
}

