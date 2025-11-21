/**
 * 职业规划模型
 */

import { callLLM } from "@/lib/llm";
import { CAREER_PLANNING_SYSTEM_PROMPT } from "../prompts/career_planning";

export type CareerPlanningResult = {
  reply: string;
  structured: {
    intentRole?: string;
    keySkills?: string[];
  };
};

export async function runDeepSeekCareer(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<CareerPlanningResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: CAREER_PLANNING_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 500,
    provider: "deepseek",
  });

  // 解析回复，提取结构化信息
  const structured: CareerPlanningResult["structured"] = {};

  // 简单的关键词提取（实际可以使用更复杂的 NLP）
  const intentPatterns = [
    /(?:想|希望|目标|意向).*?(?:岗位|职位|工作|职业|方向)[是：:为]?[：:，,]?([^，。\n]+)/i,
    /(?:做|成为|当).*?([^，。\n]*(?:工程师|设计师|经理|专员|助理))/i,
  ];

  for (const pattern of intentPatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      structured.intentRole = match[1].trim();
      break;
    }
  }

  // 提取技能关键词
  const skillKeywords = [
    "React", "Vue", "Angular", "TypeScript", "JavaScript",
    "Python", "Java", "Node", "Next", "Tailwind", "CSS",
    "HTML", "Git", "Docker", "Kubernetes", "MySQL", "MongoDB",
    "Redis", "AWS", "Azure", "产品", "运营", "设计", "前端", "后端",
  ];

  const foundSkills: string[] = [];
  for (const keyword of skillKeywords) {
    if (response.includes(keyword) && !foundSkills.includes(keyword)) {
      foundSkills.push(keyword);
    }
  }

  if (foundSkills.length > 0) {
    structured.keySkills = foundSkills;
  }

  return {
    reply: response,
    structured,
  };
}

