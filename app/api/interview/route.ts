/**
 * 模拟面试统一 API
 * 支持 start_round, answer, next_question, finish_round 四种 action
 * 支持 stub 模式和 deepseek 模式
 */

import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

// ========== 类型定义 ==========

type Action = "start_round" | "answer" | "next_question" | "finish_round";

interface RequestBody {
  sessionId?: string;
  userId?: string;
  action: Action;
  roundType?: "业务面" | "技术面" | "HR面" | "主管面";
  questionCount?: number; // 题数设置
  questionId?: string;
  answer?: string;
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

interface QuestionTips {
  intent: string; // 考察意图
  keyPoints: string[]; // 需要关注点
  framework: string; // 回答框架
  industryNotes?: string; // 行业特性
  pitfalls?: string[]; // 需要避免
  proTips?: string[]; // 内行窍门
}

interface InterviewQuestion {
  id: string;
  q: string;
  tips: QuestionTips;
}

interface QuestionEvaluation {
  accuracy: number; // 准确性 0-100
  grammar: number; // 语法 0-100
  detail?: number; // 细节 0-100 (可选)
  confidence: number; // 自信 0-100
  tips: string; // 改进建议
}

type ResponseType = "next-question" | "evaluation" | "round-complete" | "error";

interface APIResponse {
  type: ResponseType;
  payload: any;
  debug?: any;
}

// ========== 工具函数 ==========

/**
 * 检查是否使用 stub 模式（没有 API key）
 */
function isStubMode(): boolean {
  return !process.env.DEEPSEEK_API_KEY;
}

/**
 * 生成唯一 ID
 */
function makeId(len = 8): string {
  const s = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < len; i++) {
    r += s[Math.floor(Math.random() * s.length)];
  }
  return r;
}

// ========== Stub 模式：硬编码返回 ==========

/**
 * Stub: 开始轮次 - 返回第一个问题
 */
function stubStartRound(roundType: string): APIResponse {
  const questionId = `q_${Date.now()}`;
  
  // 根据轮次类型返回不同的问题
  const questionsByRound: Record<string, InterviewQuestion> = {
    业务面: {
      id: questionId,
      q: "请介绍一下你最近负责的一个产品项目，包括项目背景、你的角色、关键决策和最终成果。",
      tips: {
        intent: "考察产品思维、项目管理和结果导向能力",
        keyPoints: [
          "项目背景和目标要清晰",
          "突出个人在项目中的核心贡献",
          "关键决策要有理有据",
          "成果要量化，最好有数据支撑",
        ],
        framework: "背景 → 目标 → 我的角色 → 关键决策 → 执行过程 → 结果指标",
        industryNotes: "产品经理需要具备从0到1的产品能力，以及跨部门协作能力",
        pitfalls: ["只讲过程不讲结果", "没有突出个人贡献", "缺乏数据支撑"],
        proTips: ["用 STAR 法则组织回答", "准备1-2个具体的数据指标", "体现产品思维和用户视角"],
      },
    },
    技术面: {
      id: questionId,
      q: "请详细描述一个你解决过的技术难题，包括问题背景、分析过程、解决方案和最终效果。",
      tips: {
        intent: "考察技术深度、问题解决能力和技术思维",
        keyPoints: [
          "问题要具体且有挑战性",
          "分析过程要体现技术思维",
          "解决方案要合理且可执行",
          "效果要有量化指标",
        ],
        framework: "问题描述 → 问题分析 → 解决方案 → 实施过程 → 效果验证",
        industryNotes: "技术面试更关注解决问题的思路和技术深度",
        pitfalls: ["问题描述不清晰", "缺乏技术细节", "没有体现思考过程"],
        proTips: ["准备一个能体现技术深度的案例", "突出解决问题的思路", "准备技术细节"],
      },
    },
    项目深挖: {
      id: questionId,
      q: "请用 STAR 法则详细描述一个你主导的项目，包括 Situation、Task、Action 和 Result。",
      tips: {
        intent: "深挖项目细节，考察项目管理和执行能力",
        keyPoints: [
          "Situation 要清晰描述背景",
          "Task 要明确你的任务和目标",
          "Action 要详细说明具体行动",
          "Result 要有量化的结果",
        ],
        framework: "Situation → Task → Action → Result",
        industryNotes: "项目深挖通常关注项目的复杂度和你的贡献",
        pitfalls: ["缺乏具体细节", "没有量化结果", "没有体现个人贡献"],
        proTips: ["准备多个 STAR 案例", "每个案例准备3-5个追问点", "结果要量化"],
      },
    },
    HR面: {
      id: questionId,
      q: "请介绍一下你的职业规划，以及为什么选择我们公司？",
      tips: {
        intent: "考察职业规划、动机和匹配度",
        keyPoints: [
          "职业规划要清晰且有逻辑",
          "要体现对公司/岗位的了解",
          "要说明为什么匹配",
          "要体现长期发展意愿",
        ],
        framework: "职业规划 → 公司了解 → 匹配度分析 → 未来展望",
        industryNotes: "HR 面更关注软技能和文化匹配",
        pitfalls: ["职业规划不清晰", "对公司了解不足", "缺乏匹配度说明"],
        proTips: ["提前了解公司文化和业务", "准备职业规划的回答", "体现学习能力和成长意愿"],
      },
    },
    总监面: {
      id: questionId,
      q: "请谈谈你对行业趋势的理解，以及你认为未来3-5年这个行业会如何发展？",
      tips: {
        intent: "考察行业认知、战略思维和前瞻性",
        keyPoints: [
          "要体现对行业的深度理解",
          "要有自己的观点和判断",
          "要结合公司业务谈发展",
          "要体现战略思维",
        ],
        framework: "行业现状 → 趋势分析 → 未来预测 → 对业务的影响",
        industryNotes: "总监面更关注战略思维和行业认知",
        pitfalls: ["缺乏深度思考", "观点不够独特", "没有结合业务"],
        proTips: ["关注行业动态和趋势", "准备1-2个独特的观点", "体现战略思维"],
      },
    },
  };

  const question = questionsByRound[roundType] || questionsByRound["业务面"];

  return {
    type: "next-question",
    payload: {
      question,
    },
    debug: {
      mode: "stub",
      roundType,
    },
  };
}

/**
 * Stub: 回答问题 - 返回评估结果
 */
function stubAnswer(questionId: string, answer: string): APIResponse {
  // 简单的评估逻辑（基于回答长度和关键词）
  const answerLength = answer.length;
  const hasData = /数据|指标|增长|提升|降低|优化/i.test(answer);
  const hasDetail = answerLength > 100;
  const hasStructure = /首先|然后|最后|第一|第二|第三/i.test(answer);

  const accuracy = hasData ? 75 : 60;
  const grammar = hasStructure ? 85 : 70; // 语法评分
  const detail = hasDetail ? 80 : 55;
  const confidence = answerLength > 150 ? 75 : 65;

  const evaluation: QuestionEvaluation = {
    accuracy,
    grammar,
    detail,
    confidence,
    tips: hasData
      ? "回答很好，数据支撑充分。建议在逻辑结构上可以更清晰一些。"
      : "回答可以更具体一些，建议补充一些数据指标来支撑你的观点。",
  };

  return {
    type: "evaluation",
    payload: {
      questionId,
      evaluation,
      exemplarAnswer: "这是一个示范回答，包含了项目背景、个人角色、关键决策、执行过程和量化结果。",
    },
    debug: {
      mode: "stub",
      answerLength,
      hasData,
      hasDetail,
      hasStructure,
    },
  };
}

/**
 * Stub: 下一题 - 返回下一个问题
 */
function stubNextQuestion(roundType: string, currentIndex: number): APIResponse {
  const questions: InterviewQuestion[] = [
    {
      id: `q_${Date.now()}_1`,
      q: "请讲一个你主导的项目，包括项目背景、你的角色、关键决策和最终成果。",
      tips: {
        intent: "考察项目管理和执行能力",
        keyPoints: ["项目背景", "个人角色", "关键决策", "最终成果"],
        framework: "背景 → 角色 → 决策 → 成果",
      },
    },
    {
      id: `q_${Date.now()}_2`,
      q: "请描述一次你解决过的复杂问题，包括问题分析、解决方案和最终效果。",
      tips: {
        intent: "考察问题解决能力",
        keyPoints: ["问题分析", "解决方案", "最终效果"],
        framework: "分析 → 解决 → 效果",
      },
    },
    {
      id: `q_${Date.now()}_3`,
      q: "请谈谈你的职业规划，以及为什么选择这个岗位？",
      tips: {
        intent: "考察职业规划和动机",
        keyPoints: ["职业规划", "岗位匹配", "发展意愿"],
        framework: "规划 → 匹配 → 意愿",
      },
    },
  ];

  const nextIndex = currentIndex + 1;
  if (nextIndex >= questions.length) {
    // 所有问题已回答，返回完成
    return stubFinishRound();
  }

  return {
    type: "next-question",
    payload: {
      question: questions[nextIndex],
    },
    debug: {
      mode: "stub",
      currentIndex: nextIndex,
      total: questions.length,
    },
  };
}

/**
 * Stub: 完成轮次 - 返回总结
 */
function stubFinishRound(): APIResponse {
  return {
    type: "round-complete",
    payload: {
      summary: {
        scores: {
          accuracy: 75,
          detail: 65,
          logic: 80,
          confidence: 70,
        },
        highlights: ["结构清晰", "逻辑性强", "表达流畅"],
        gaps: ["项目细节可以更具体", "数据支撑可以更充分"],
        practiceSuggestions: [
          "补充一个更定量的项目结果",
          "准备更多 STAR 案例",
          "加强数据化表达",
        ],
      },
      reportId: `report_${Date.now()}`,
    },
    debug: {
      mode: "stub",
    },
  };
}

// ========== DeepSeek 模式：调用 LLM ==========

/**
 * DeepSeek: 开始轮次 - 生成第一个问题
 */
async function deepseekStartRound(
  roundType: string,
  sessionId: string,
  userId: string
): Promise<APIResponse> {
  const systemPrompt = `你是一位专业的 AI 面试官，负责进行${roundType}面试。

你的任务是根据轮次类型生成合适的面试问题，并返回 JSON 格式。

要求：
1. 只返回 JSON，不要包含任何其他文字
2. 问题要符合${roundType}的特点
3. 提示信息要详细且实用

返回格式：
{
  "question": {
    "id": "q_xxx",
    "q": "问题内容",
    "tips": {
      "intent": "考察意图",
      "keyPoints": ["要点1", "要点2"],
      "framework": "回答框架",
      "industryNotes": "行业特性（可选）",
      "pitfalls": ["避坑点1", "避坑点2"]（可选）,
      "proTips": ["窍门1", "窍门2"]（可选）
    }
  }
}`;

  const userPrompt = `请为${roundType}生成第一个面试问题，要求：
1. 问题要有针对性，符合${roundType}的考察重点
2. 提示信息要全面，包括考察意图、回答要点、回答框架等
3. 如果适用，可以包含行业特性、避坑点和内行窍门

请返回 JSON 格式：`;

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.7,
        maxTokens: 1000,
        provider: "deepseek",
      }
    );

    // 解析 JSON
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        type: "next-question",
        payload: {
          question: data.question,
        },
        debug: {
          mode: "deepseek",
          roundType,
        },
      };
    }

    throw new Error("无法解析 LLM 返回的 JSON");
  } catch (error: any) {
    console.error("DeepSeek start_round 失败:", error);
    // 降级到 stub
    return stubStartRound(roundType);
  }
}

/**
 * DeepSeek: 回答问题 - 生成评估
 */
async function deepseekAnswer(
  questionId: string,
  question: string,
  answer: string,
  roundType: string
): Promise<APIResponse> {
  const systemPrompt = `你是一位专业的 AI 面试评估官，负责评估候选人的回答。

你的任务是根据候选人的回答，给出详细的评估，并返回 JSON 格式。

要求：
1. 只返回 JSON，不要包含任何其他文字
2. 评分要客观公正（0-100分）
3. 建议要具体可操作

返回格式：
{
  "evaluation": {
    "accuracy": 75,
    "detail": 80,
    "logic": 70,
    "confidence": 85,
    "tips": "改进建议"
  },
  "exemplarAnswer": "示范回答（可选）"
}`;

  const userPrompt = `问题：${question}

候选人回答：${answer}

请评估候选人的回答，考虑以下维度（每个维度0-100分）：
1. 准确性（accuracy）：回答是否切题、信息是否准确、是否回答了问题的核心
2. 语法（grammar）：表达是否流畅、语法是否正确、用词是否恰当
3. 细节（detail，可选）：回答是否充分、是否有具体细节、是否有数据支撑
4. 自信度（confidence）：表达是否自信、是否有说服力、语气是否坚定

请返回 JSON 格式：
{
  "evaluation": {
    "accuracy": 75,
    "grammar": 80,
    "detail": 70,
    "confidence": 85,
    "tips": "具体的改进建议"
  },
  "exemplarAnswer": "示范回答（可选）"
}`;

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 800,
        provider: "deepseek",
      }
    );

    // 解析 JSON
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        type: "evaluation",
        payload: {
          questionId,
          evaluation: data.evaluation,
          exemplarAnswer: data.exemplarAnswer || "",
        },
        debug: {
          mode: "deepseek",
        },
      };
    }

    throw new Error("无法解析 LLM 返回的 JSON");
  } catch (error: any) {
    console.error("DeepSeek answer 失败:", error);
    // 降级到 stub
    return stubAnswer(questionId, answer);
  }
}

/**
 * DeepSeek: 下一题 - 生成下一个问题
 */
async function deepseekNextQuestion(
  roundType: string,
  answeredQuestions: Array<{ question: string; answer: string }>,
  currentIndex: number
): Promise<APIResponse> {
  const systemPrompt = `你是一位专业的 AI 面试官，负责进行${roundType}面试。

你的任务是根据已问过的问题和候选人的回答，生成下一个合适的问题，并返回 JSON 格式。

要求：
1. 只返回 JSON，不要包含任何其他文字
2. 问题要有递进性，不要重复已问的问题
3. 可以根据候选人的回答进行深入追问

返回格式：
{
  "question": {
    "id": "q_xxx",
    "q": "问题内容",
    "tips": {
      "intent": "考察意图",
      "keyPoints": ["要点1", "要点2"],
      "framework": "回答框架",
      "industryNotes": "行业特性（可选）",
      "pitfalls": ["避坑点1"]（可选）,
      "proTips": ["窍门1"]（可选）
    }
  }
}`;

  const history = answeredQuestions
    .map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`)
    .join("\n\n");

  const userPrompt = `已问过的问题和回答：
${history}

请生成下一个问题（第${currentIndex + 2}题），要求：
1. 问题要有递进性
2. 可以根据候选人的回答进行深入追问
3. 提示信息要全面

请返回 JSON 格式：`;

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.7,
        maxTokens: 1000,
        provider: "deepseek",
      }
    );

    // 解析 JSON
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        type: "next-question",
        payload: {
          question: data.question,
        },
        debug: {
          mode: "deepseek",
          currentIndex: currentIndex + 1,
        },
      };
    }

    throw new Error("无法解析 LLM 返回的 JSON");
  } catch (error: any) {
    console.error("DeepSeek next_question 失败:", error);
    // 降级到 stub
    return stubNextQuestion(roundType, currentIndex);
  }
}

/**
 * DeepSeek: 完成轮次 - 生成总结
 */
async function deepseekFinishRound(
  roundType: string,
  allQuestions: Array<{ question: string; answer: string; evaluation?: QuestionEvaluation }>
): Promise<APIResponse> {
  const systemPrompt = `你是一位专业的 AI 面试评估官，负责生成面试总结报告。

你的任务是根据所有问题和回答，生成一份完整的面试总结，并返回 JSON 格式。

要求：
1. 只返回 JSON，不要包含任何其他文字
2. 总结要客观全面
3. 建议要具体可操作

返回格式：
{
  "summary": {
    "scores": {
      "accuracy": 75,
      "grammar": 80,
      "detail": 70,
      "confidence": 85
    },
    "highlights": ["优点1", "优点2"],
    "gaps": ["薄弱点1", "薄弱点2"],
    "practiceSuggestions": ["建议1", "建议2"]
  }
}`;

  const history = allQuestions
    .map(
      (qa, idx) =>
        `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}${
          qa.evaluation ? `\n评估: ${JSON.stringify(qa.evaluation)}` : ""
        }`
    )
    .join("\n\n");

  const userPrompt = `${roundType}面试完整记录：
${history}

请生成面试总结，包括：
1. 综合评分（基于各项评估的平均值：准确性、语法、细节、自信度）
2. 亮点表现（2-3个）
3. 薄弱环节（2-3个）
4. 练习建议（2-3个具体可操作的建议）

请返回 JSON 格式：`;

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 1000,
        provider: "deepseek",
      }
    );

    // 解析 JSON
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        type: "round-complete",
        payload: {
          summary: data.summary,
          reportId: `report_${Date.now()}`,
        },
        debug: {
          mode: "deepseek",
        },
      };
    }

    throw new Error("无法解析 LLM 返回的 JSON");
  } catch (error: any) {
    console.error("DeepSeek finish_round 失败:", error);
    // 降级到 stub
    return stubFinishRound();
  }
}

// ========== 主处理函数 ==========

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json().catch(() => ({} as RequestBody));

    const { action, sessionId, userId, roundType, questionId, answer, recentMessages } = body;

    // 验证必需参数
    if (!action) {
      return NextResponse.json(
        {
          type: "error",
          payload: { message: "缺少 action 参数" },
        },
        { status: 400 }
      );
    }

    const useStub = isStubMode();

    // 根据 action 分发处理
    switch (action) {
      case "start_round": {
        if (!roundType) {
          return NextResponse.json(
            {
              type: "error",
              payload: { message: "start_round 需要 roundType 参数" },
            },
            { status: 400 }
          );
        }

        if (useStub) {
          return NextResponse.json(stubStartRound(roundType));
        } else {
          // 如果没有提供 sessionId 或 userId，生成临时值（允许面试功能独立使用）
          const finalSessionId = sessionId || `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const finalUserId = userId || `user_${Date.now()}`;
          const result = await deepseekStartRound(roundType, finalSessionId, finalUserId);
          return NextResponse.json(result);
        }
      }

      case "answer": {
        if (!questionId || !answer) {
          return NextResponse.json(
            {
              type: "error",
              payload: { message: "answer 需要 questionId 和 answer 参数" },
            },
            { status: 400 }
          );
        }

        if (useStub) {
          return NextResponse.json(stubAnswer(questionId, answer));
        } else {
          // 从 recentMessages 中提取问题（简化处理）
          const question = recentMessages?.find((m) => m.role === "assistant")?.content || "";
          const result = await deepseekAnswer(
            questionId,
            question,
            answer,
            roundType || "业务面"
          );
          return NextResponse.json(result);
        }
      }

      case "next_question": {
        if (!roundType) {
          return NextResponse.json(
            {
              type: "error",
              payload: { message: "next_question 需要 roundType 参数" },
            },
            { status: 400 }
          );
        }

        // 从 recentMessages 中提取已回答的问题（简化处理）
        const currentIndex = recentMessages?.filter((m) => m.role === "user").length || 0;
        const questionCount = body.questionCount || 3;
        const answeredQuestions: Array<{ question: string; answer: string }> = [];

        if (recentMessages) {
          let currentQ = "";
          for (const msg of recentMessages) {
            if (msg.role === "assistant") {
              currentQ = msg.content;
            } else if (msg.role === "user" && currentQ) {
              answeredQuestions.push({ question: currentQ, answer: msg.content });
            }
          }
        }

        if (useStub) {
          return NextResponse.json(stubNextQuestion(roundType, currentIndex, questionCount));
        } else {
          const result = await deepseekNextQuestion(roundType, answeredQuestions, currentIndex);
          return NextResponse.json(result);
        }
      }

      case "finish_round": {
        if (!roundType) {
          return NextResponse.json(
            {
              type: "error",
              payload: { message: "finish_round 需要 roundType 参数" },
            },
            { status: 400 }
          );
        }

        // 从 recentMessages 中提取所有问题和回答（简化处理）
        const allQuestions: Array<{
          question: string;
          answer: string;
          evaluation?: QuestionEvaluation;
        }> = [];

        if (recentMessages) {
          let currentQ = "";
          for (const msg of recentMessages) {
            if (msg.role === "assistant") {
              currentQ = msg.content;
            } else if (msg.role === "user" && currentQ) {
              allQuestions.push({ question: currentQ, answer: msg.content });
            }
          }
        }

        if (useStub) {
          return NextResponse.json(stubFinishRound());
        } else {
          const result = await deepseekFinishRound(roundType, allQuestions);
          return NextResponse.json(result);
        }
      }

      default:
        return NextResponse.json(
          {
            type: "error",
            payload: { message: `未知的 action: ${action}` },
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("/api/interview 错误:", error);
    return NextResponse.json(
      {
        type: "error",
        payload: { message: error.message || "服务器内部错误" },
      },
      { status: 500 }
    );
  }
}
