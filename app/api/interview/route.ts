import { NextResponse } from "next/server";
import OpenAI from "openai";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Body = {
  sessionId?: string;
  message?: string;
};

type QA = { question: string; answer?: string };

type InterviewState = {
  questions: QA[];
  currentIndex: number; // 指向下一道要问的问题索引
  createdAt: Date;
};

const INTERVIEWS = new Map<string, InterviewState>();

function makeId(len = 8) {
  const s = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < len; i++) r += s[Math.floor(Math.random() * s.length)];
  return r;
}

function initialQuestions(): QA[] {
  return [
    {
      question:
        "请做一次项目复盘：目标、你负责的核心工作、关键决策、结果指标，以及复盘反思。",
    },
    {
      question:
        "谈谈你对用户洞察的一个案例：如何发现洞察、采用了哪些方法（如访谈/埋点/问卷）、如何影响产品方案？",
    },
    {
      question:
        "描述一次数据驱动的决策：你如何定义指标、设计实验或AB、解读结果并落地？",
    },
  ];
}

async function callDeepSeek(messages: Message[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not found");

  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  const completion = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    temperature: 0.7,
    max_tokens: 700,
  });
  return completion.choices[0]?.message?.content ?? "";
}

export async function POST(request: Request) {
  try {
    const { sessionId: providedSessionId, message }: Body = await request
      .json()
      .catch(() => ({} as Body));

    const systemPrompt =
      "你是一位理性的 AI 面试官，请针对产品经理岗位进行结构化面试。每次只问一个问题。结尾生成总结反馈（优点+改进方向）。";

    // 初始化会话
    if (!providedSessionId) {
      const newId = makeId();
      const qs = initialQuestions();
      INTERVIEWS.set(newId, {
        questions: qs,
        currentIndex: 0,
        createdAt: new Date(),
      });

      return NextResponse.json({
        sessionId: newId,
        questions: qs.map((q) => q.question),
        question: qs[0].question,
        index: 0,
        total: qs.length,
      });
    }

    // 继续面试流程
    const st = INTERVIEWS.get(providedSessionId);
    if (!st) {
      // 不存在则重建
      const newId = makeId();
      const qs = initialQuestions();
      INTERVIEWS.set(newId, {
        questions: qs,
        currentIndex: 0,
        createdAt: new Date(),
      });
      return NextResponse.json({
        sessionId: newId,
        questions: qs.map((q) => q.question),
        question: qs[0].question,
        index: 0,
        total: qs.length,
      });
    }

    // 记录回答
    const i = st.currentIndex;
    if (i >= st.questions.length) {
      // 已超出则直接生成总结
      const feedback = await generateFeedback(systemPrompt, st.questions);
      return NextResponse.json({ sessionId: providedSessionId, done: true, feedback });
    }

    if (!message || !message.trim()) {
      // 未提供回答
      return NextResponse.json(
        { sessionId: providedSessionId, error: "请先回答当前问题" },
        { status: 400 }
      );
    }

    st.questions[i].answer = message.trim();
    st.currentIndex += 1;

    // 是否还有下一题
    if (st.currentIndex < st.questions.length) {
      const nextQ = st.questions[st.currentIndex].question;
      return NextResponse.json({
        sessionId: providedSessionId,
        question: nextQ,
        index: st.currentIndex,
        total: st.questions.length,
      });
    }

    // 全部答完，生成总结反馈
    const feedback = await generateFeedback(systemPrompt, st.questions);
    return NextResponse.json({ sessionId: providedSessionId, done: true, feedback });
  } catch (error) {
    console.error("/api/interview 错误:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

async function generateFeedback(systemPrompt: string, qas: QA[]) {
  const lines = qas
    .map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer ?? "(未回答)"}`)
    .join("\n\n");

  const userPrompt = `以下是候选人与面试官的问答，请按照要求给出整体反馈（优点+改进方向，条理清晰）：\n\n${lines}`;

  const content = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
  return content;
}


