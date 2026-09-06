/**
 * 回答缺口检测器
 *
 * 拦截空回答、占位词、重复字符和无事实回答，但不再机械地按字数判低信息：
 * PRD 验收场景 4 要求「回答短但准确，不能被机械判成低信息而强制补字数」。
 *
 * 被拦下之后也不锁死用户：PRD §2 要求提供求助、微课、分步练习和返回原题，
 * 且未掌握不等于禁止浏览下一题。
 */

// 明确说「不知道 / 不会」
const EXACT_MATCH_PATTERNS = /^(不会|不知道|不清楚|没印象|忘了|不记得|不知道啊|我不会|我觉得还行|还好|一般般|差不多|还行吧|可以|不好|不好说|这个问题我没想过|没了解过|暂时没有)$/i;

// 明确说「没做过」——这是经验缺口，不是表达问题，处理方式不同
const NEVER_DONE_PATTERNS = /^(没有|没做过|没做过这个|没经验|没接触过|没实践过|我没做过|没落地过|没实际做过)$/i;

// 包含占位词（短回答中出现即判低信息）
const CONTAINS_PLACEHOLDER_RE = /(嗯|啊|额|额额|呃|emm|hmm|ok|okay|emmmm|emmm)+$/i;

// 仅重复单字符（如"啊啊啊啊"、"不知道不知道"）
const REPEATED_CHAR_RE = /^(.)\1{2,}$/;
const REPEATED_WORD_RE = /^(.{2,})\1{2,}$/;

// 纯标点或空白
const PUNCTUATION_ONLY_RE = /^[\s\.\,，。！？、\?\!]+$/;

// 最小有效字符数（去掉空白后）
const MIN_CHARS = 6;

/**
 * 具体证据信号：带单位的数字，或英文技术名词。
 * 命中即认为回答有实质内容，哪怕很短。
 */
const NUMBER_WITH_UNIT_RE = /\d+(?:\.\d+)?\s*(?:%|个百分点|万|亿|倍|次|人|天|周|个月|年|ms|qps|token|条|轮)/gi;
const TECH_TERM_RE = /\b[A-Za-z][A-Za-z0-9+.#-]{2,}\b/g;

const FILLER_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "you", "are", "was", "were", "have", "has",
  "ok", "okay", "yes", "no", "not", "but", "can", "will", "all", "get", "got", "use", "used",
]);

export type AnswerGapKind =
  | "none"
  | "empty"
  | "placeholder"
  | "never_done"
  | "repeated"
  | "too_short";

export interface AnswerGapResult {
  kind: AnswerGapKind;
  isLowInfo: boolean;
  reason?: string;
  /** 短回答里被识别出的具体证据，用于向用户解释为什么没被拦下。 */
  concreteSignals: string[];
}

export function extractConcreteSignals(answer: string): string[] {
  const numbers = answer.match(NUMBER_WITH_UNIT_RE) || [];
  const terms = (answer.match(TECH_TERM_RE) || []).filter(
    (term) => !FILLER_WORDS.has(term.toLowerCase()),
  );
  return [...new Set([...numbers.map((item) => item.trim()), ...terms])];
}

/**
 * 检测回答缺口。
 * 有具体证据的短回答不再被判成低信息。
 */
export function detectAnswerGap(answer: string): AnswerGapResult {
  const trimmed = answer.trim();

  if (trimmed.length === 0) return { kind: "empty", isLowInfo: true, reason: "empty", concreteSignals: [] };
  if (PUNCTUATION_ONLY_RE.test(trimmed)) {
    return { kind: "empty", isLowInfo: true, reason: "punctuation_only", concreteSignals: [] };
  }
  if (NEVER_DONE_PATTERNS.test(trimmed)) {
    return { kind: "never_done", isLowInfo: true, reason: "never_done", concreteSignals: [] };
  }
  if (EXACT_MATCH_PATTERNS.test(trimmed)) {
    return { kind: "placeholder", isLowInfo: true, reason: "placeholder", concreteSignals: [] };
  }
  if (REPEATED_CHAR_RE.test(trimmed)) {
    return { kind: "repeated", isLowInfo: true, reason: "repeated_char", concreteSignals: [] };
  }
  if (REPEATED_WORD_RE.test(trimmed)) {
    return { kind: "repeated", isLowInfo: true, reason: "repeated_word", concreteSignals: [] };
  }

  const concreteSignals = extractConcreteSignals(trimmed);

  if (CONTAINS_PLACEHOLDER_RE.test(trimmed)) {
    const stripped = trimmed.replace(CONTAINS_PLACEHOLDER_RE, "").trim();
    if (stripped.length < MIN_CHARS && concreteSignals.length === 0) {
      return { kind: "too_short", isLowInfo: true, reason: "trailing_placeholder", concreteSignals };
    }
  }

  // 验收场景 4：短但准确不算低信息。
  if (trimmed.length < MIN_CHARS) {
    if (concreteSignals.length > 0) {
      return { kind: "none", isLowInfo: false, concreteSignals };
    }
    return { kind: "too_short", isLowInfo: true, reason: "too_short", concreteSignals: [] };
  }

  return { kind: "none", isLowInfo: false, concreteSignals };
}

/** 兼容旧调用方：只返回布尔判断。 */
export function detectLowInfoAnswer(answer: string): { isLowInfo: boolean; reason?: string } {
  const result = detectAnswerGap(answer);
  return result.isLowInfo ? { isLowInfo: true, reason: result.reason } : { isLowInfo: false };
}

export type HelpOptionId =
  | "explain_directly"
  | "let_me_try"
  | "micro_lesson"
  | "guided_practice"
  | "back_to_question"
  | "next_question";

export interface HelpOption {
  id: HelpOptionId;
  label: string;
  description: string;
  cost: "free" | "credits";
}

export interface HelpBranch {
  status: "needs_help";
  gap: AnswerGapKind;
  message: string;
  options: HelpOption[];
  /** 未掌握不等于禁止浏览下一题。 */
  canAdvance: boolean;
  advanceLabel: string;
  /** 紧急面试模式压缩讲解，允许跳过但如实记录。 */
  urgent: boolean;
  /** 本次求助要如实记进学习证据，不能之后当成已掌握。 */
  recordNote: string;
}

const GAP_MESSAGE: Record<Exclude<AnswerGapKind, "none">, string> = {
  empty: "这一题还没有你的回答。可以先看讲解，也可以在提示下写一句。",
  placeholder: "你说不知道，那就先把它讲清楚，再回来答。这不是能力问题，是还没学。",
  never_done: "你没做过这件事，那就不能写成做过。先看清缺口，再决定是补一个小实验还是改写简历。",
  repeated: "这句没有实质内容。可以先看讲解，也可以让导师给你一个结构。",
  too_short: "这一句太短，面试官会追问。补上你的角色、动作和结果就够了。",
};

const RECORD_NOTE: Record<Exclude<AnswerGapKind, "none">, string> = {
  empty: "本题未作答，已提供讲解入口。",
  placeholder: "用户表示不知道，已提供微课与分步练习；本次不计入掌握。",
  never_done: "用户表示没有做过；禁止生成为个人经历，需另建可完成的实验。",
  repeated: "回答无实质内容，已提供讲解入口。",
  too_short: "回答过短且无可核实细节，已提供结构提示。",
};

/**
 * PRD §3.5：缺口分类决定行为。
 * 不懂概念 → 短讲解 → 对照示例 → 小练习
 * 没有做过 → 说明经验缺口 → 给可完成的小实验（禁止编造）
 * 懂但说不清 → 指出断点 → 给结构 → 用户重述
 */
export function buildHelpBranch(input: {
  gap: AnswerGapKind;
  urgent?: boolean;
  question?: string | null;
}): HelpBranch {
  const urgent = Boolean(input.urgent);
  const gap = input.gap === "none" ? "too_short" : input.gap;

  const base: HelpOption[] = [
    { id: "explain_directly", label: "直接解释", description: urgent ? "只讲最关键的一句，马上能答。" : "先讲清楚这个概念，再给一个对照示例。", cost: "free" },
    { id: "let_me_try", label: "让我试试", description: "给一个结构，你自己写一句，导师再评。", cost: "free" },
  ];

  const options: HelpOption[] = gap === "never_done"
    ? [
        { id: "micro_lesson", label: "这个缺口是什么", description: "说明为什么这里会被追问，以及可以补的最小实验。", cost: "free" },
        { id: "guided_practice", label: "做一个能完成的小实验", description: "给出可在本周完成、能留下真实产物的实验。", cost: "free" },
        { id: "explain_directly", label: "先看看怎么答", description: "在不编造经历的前提下，给出这一题的答法。", cost: "free" },
      ]
    : [
        ...base,
        { id: "micro_lesson", label: "看一节微课", description: "讲解加对照示例，几分钟内能看完。", cost: "free" },
        { id: "guided_practice", label: "分步练习", description: "拆成几步，一步步答完再合起来。", cost: "free" },
      ];

  options.push({
    id: "back_to_question",
    label: "返回原题",
    description: "回到题目，看看原文和可用材料。",
    cost: "free",
  });

  return {
    status: "needs_help",
    gap,
    message: GAP_MESSAGE[gap],
    options,
    // 未掌握不等于禁止浏览下一题。
    canAdvance: true,
    advanceLabel: "先跳过，看下一题",
    urgent,
    recordNote: RECORD_NOTE[gap],
  };
}

/** 生成 needs_more_input 评估结果（兼容既有前端契约） */
export function buildNeedsMoreInputAssessment(
  reason: string,
  options: { urgent?: boolean } = {},
): {
  status: "needs_more_input";
  score: null;
  summary: string;
  evidence: string[];
  missingEvidence: string[];
  dimensions: Array<{ name: string; comment: string }>;
  rewritePlan: string[];
  followUp: string;
  helpBranch: HelpBranch;
} {
  const gap: Exclude<AnswerGapKind, "none"> =
    reason === "empty" || reason === "punctuation_only" ? "empty"
      : reason === "never_done" ? "never_done"
        : reason === "repeated_char" || reason === "repeated_word" ? "repeated"
          : reason === "too_short" || reason === "trailing_placeholder" ? "too_short"
            : "placeholder";
  const branch = buildHelpBranch({ gap, urgent: options.urgent });

  const reasonMessages: Record<string, { summary: string; followUp: string; hint: string }> = {
    empty: {
      summary: "回答为空，请补充你的实际经历或想法。",
      followUp: "能否简单描述一下你在这个场景下的具体做法或决策？",
      hint: "请用一句话描述你在类似场景中的实际做法",
    },
    placeholder: {
      summary: "你表示不知道。先把它讲清楚，再回来答。",
      followUp: "先给你讲一遍，然后我们用同一题再试一次。",
      hint: "先看完讲解，再用自己的话答一遍",
    },
    never_done: {
      summary: "你表示没有做过这件事。这不能被写成做过。",
      followUp: "先说明这个缺口，再看能不能补一个本周能完成的小实验。",
      hint: "不要编造经历；先确认缺口，再决定补实验还是改写法",
    },
    too_short: {
      summary: "回答过短，面试官会追问。补上你的角色、动作和结果。",
      followUp: "用「我负责什么 → 做了什么 → 结果如何」补齐一遍。",
      hint: "请补充你的角色、行动和结果",
    },
    trailing_placeholder: {
      summary: "回答末尾缺少有效信息。",
      followUp: "用「我负责什么 → 做了什么 → 结果如何」补齐一遍。",
      hint: "请补充具体的行动步骤和可衡量的结果",
    },
    repeated_char: {
      summary: "回答包含重复字符，缺少实质性内容。",
      followUp: "请用完整的句子描述你的实际经历。",
      hint: "请组织语言，描述一个具体事例",
    },
    repeated_word: {
      summary: "回答重复内容较多，缺少具体信息。",
      followUp: "请换个角度，描述你的具体做法或决策过程。",
      hint: "请提供一个具体的项目或场景",
    },
    punctuation_only: {
      summary: "回答仅包含标点符号，缺少实质内容。",
      followUp: "请用文字描述你的实际经历或想法。",
      hint: "请描述一个具体的事例",
    },
  };

  const msg = reasonMessages[reason] || reasonMessages.placeholder;

  return {
    status: "needs_more_input",
    score: null,
    summary: msg.summary,
    evidence: [],
    missingEvidence: ["回答中未提供具体事实或经历"],
    dimensions: [],
    rewritePlan: [msg.hint],
    followUp: msg.followUp,
    helpBranch: branch,
  };
}
