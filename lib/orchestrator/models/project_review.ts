/**
 * 项目梳理模型
 */

import { callLLM } from "@/lib/llm";
import { PROJECT_REVIEW_SYSTEM_PROMPT } from "../prompts/project_review";

export type ProjectReviewResult = {
  reply: string;
  structured: {
    starProjects?: Array<{
      id: string;
      title: string;
      situation?: string;
      task?: string;
      action?: string;
      result?: string;
    }>;
  };
};

export async function runDeepSeekProjectReview(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<ProjectReviewResult> {
  // 构建消息数组
  const llmMessages = [
    { role: "system" as const, content: PROJECT_REVIEW_SYSTEM_PROMPT },
    ...messages,
  ];

  // 调用 LLM
  const response = await callLLM(llmMessages, {
    temperature: 0.7,
    maxTokens: 800,
    provider: "deepseek",
  });

  // 解析回复，提取项目信息
  const structured: ProjectReviewResult["structured"] = {};

  // 尝试从对话中提取项目信息
  const allText = messages.map(m => m.content).join(" ") + " " + response;
  
  // 简单的项目提取（实际可以使用更复杂的 NLP 或要求 LLM 返回 JSON）
  const projectPatterns = [
    /(?:项目|project)[：:，,]?([^，。\n]{3,30})/gi,
    /(?:做了|开发了|完成了).*?([^，。\n]{3,30})/gi,
  ];

  const projects: Array<{
    id: string;
    title: string;
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
  }> = [];

  for (const pattern of projectPatterns) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 2) {
        const title = match[1].trim();
        if (!projects.some(p => p.title === title)) {
          projects.push({
            id: `project_${Date.now()}_${projects.length}`,
            title,
          });
        }
      }
    }
  }

  if (projects.length > 0) {
    structured.starProjects = projects;
  }

  return {
    reply: response,
    structured,
  };
}

