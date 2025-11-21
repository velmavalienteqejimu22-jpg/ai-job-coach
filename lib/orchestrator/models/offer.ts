/**
 * Offer 评估模型
 */

import { callLLM } from "@/lib/llm";
import { OFFER_SYSTEM_PROMPT } from "../prompts/offer";

export type OfferResult = {
  reply: string;
  structured: {
    offers?: Array<{
      company: string;
      position: string;
      salary?: string;
      benefits?: string[];
      pros?: string[];
      cons?: string[];
    }>;
  };
};

export async function runDeepSeekOffer(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<OfferResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: OFFER_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 800,
    provider: "deepseek",
  });

  // 解析回复，提取 Offer 信息
  const structured: OfferResult["structured"] = {};

  // 尝试从对话中提取公司名称
  const companyMatch = response.match(/(?:公司|企业)[：:，,]?([^，。\n]{2,20})/i);
  const salaryMatch = response.match(/(?:薪资|工资)[：:，,]?([0-9]+[kK万]?)/i);

  if (companyMatch) {
    structured.offers = [{
      company: companyMatch[1].trim(),
      position: "待定",
      salary: salaryMatch?.[1] || undefined,
      benefits: [],
      pros: ["发展前景好"],
      cons: [],
    }];
  }

  return {
    reply: response,
    structured,
  };
}

