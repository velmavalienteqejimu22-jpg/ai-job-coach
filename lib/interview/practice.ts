import { callLLM } from "@/lib/llm";
import type { ContextBundle } from "@/lib/coach-harness/types";
import type { PromptRenderResult } from "@/lib/coach-harness/types";

export type QuickPracticeAnalysis = {
  verdict: "可继续追问" | "证据不足" | "表达失焦";
  summary: string;
  strengths: string[];
  gaps: string[];
  followUp: string;
  improvedOutline: string[];
};

function parseJson(text: string) {
  const match = text.replace(/```json\s*/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回格式错误");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
}

/**
 * 单题面试练习的 LLM 评估入口。
 *
 * 设计前提：调用方已经用 ContextBundle 编译好了材料预算，并调用
 * renderContextForPrompt 渲染成文本。本函数只负责把渲染结果 + 题目 +
 * 回答拼进 prompt，不再二次裁剪。
 *
 * 这条链路存在的唯一理由：以前 route 直接把 `${jobDescription}` /
 * `${resumeText}` 拼进 user message，完全在预算之外——3 万字 JD 无声塞进
 * prompt。改为传 ContextBundle 后，关键原句装不下会被 assertContextFits
 * fail-loud 拦住，而不是截断后继续作结论。
 *
 * 题目（question）和回答（answer）由调用方单独传入：它们是这次对话的核心，
 * 应该用「面试题：/候选人回答：」这种固定抬头呈现，而不是淹没在「上下文」
 * 列表里。route 应在调用 renderContextForPrompt 时用 excludeKinds 排除
 * question_source / current_input，本函数就不会再渲染它们一次。
 */
export async function evaluateQuickPractice(input: {
  /** 已渲染的上下文文本。 */
  contextText: string;
  /** 单题面试题，必须保留原文。 */
  question: string;
  /** 候选人回答，必须保留原文。 */
  answer: string;
  /** 编译时产生的 warnings。出现在 prompt 末尾提示模型留意。 */
  warnings?: string[];
  /** 用于调用方记账和失败复现：可传整个 bundle，本函数只读 refId/fingerprint。 */
  context?: ContextBundle | PromptRenderResult | null;
}) {
  const warnings = (input.warnings || []).filter(Boolean);
  const warningBlock = warnings.length
    ? `\n\n⚠ 上下文提示：\n- ${warnings.join("\n- ")}`
    : "";
  const contextBlock = input.contextText.trim()
    ? `本次分析材料：\n${input.contextText}\n\n`
    : "本次未提供候选人材料，仅基于本次回答做最小反馈。\n\n";

  const output = await callLLM([
    {
      role: "system",
      content: `你是益职的面试教练。${input.contextText.trim() ? "只依据已确认事实、用户材料与本次回答判断，不补写候选人没有提供的经历或数字；事实以 [id] 标注的为依据，未标 [id] 的视为候选人自述。" : "本次没有候选人材料，仅依据回答本身做最小反馈。"}反馈要短、具体、可立即重答。只返回 JSON：{"verdict":"可继续追问|证据不足|表达失焦","summary":"一句判断","strengths":["最多2条"],"gaps":["最多3条"],"followUp":"面试官下一句追问","improvedOutline":["最多4步的重答提纲"]}`,
    },
    {
      role: "user",
      content: `${contextBlock}面试题：\n${input.question}\n\n候选人回答：\n${input.answer}${warningBlock}`,
    },
  ], {
    provider: "deepseek",
    temperature: 0.15,
    maxTokens: 1100,
    timeoutMs: 35_000,
    maxRetries: 1,
    responseFormat: "json_object",
  });

  const parsed = parseJson(output);
  const verdict = ["可继续追问", "证据不足", "表达失焦"].includes(String(parsed.verdict))
    ? String(parsed.verdict) as QuickPracticeAnalysis["verdict"]
    : "证据不足";
  const analysis: QuickPracticeAnalysis = {
    verdict,
    summary: String(parsed.summary || "这次回答还需要补充可核实的事实。").trim().slice(0, 600),
    strengths: stringList(parsed.strengths, 2),
    gaps: stringList(parsed.gaps, 3),
    followUp: String(parsed.followUp || "这件事里你个人做出的关键决策是什么？").trim().slice(0, 500),
    improvedOutline: stringList(parsed.improvedOutline, 4),
  };
  if (!analysis.summary || !analysis.followUp || !analysis.improvedOutline.length) throw new Error("AI 返回的反馈不完整");
  return analysis;
}