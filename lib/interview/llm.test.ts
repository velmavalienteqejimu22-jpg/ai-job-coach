import { evaluateAnswer, generateInterviewQuestions, summarizeInterview, serializeAssessmentsForPrompt } from "./llm";
import { callLLM } from "@/lib/llm";

jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));

const renderedContext = [
  "【附带材料·待确认·用户材料】[interview-jd]",
  "《岗位 JD》",
  "负责增长产品",
  "",
  "【事实·已确认】[skill-1]",
  "在生产项目中使用 TypeScript",
].join("\n");

describe("evaluateAnswer with contextText", () => {
  beforeEach(() => jest.clearAllMocks());

  test("replaces raw JD/resume blocks with the rendered context", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      status: "assessed",
      score: 85,
      summary: "好",
      evidence: ["提到了抽检"],
      missingEvidence: [],
      dimensions: [{ name: "逻辑性", score: 80, comment: "清晰" }],
      rewritePlan: ["补充数据"],
      followUp: "你的关键决策？",
    }));

    await evaluateAnswer({
      question: "如何评测？",
      jd: "原始 JD 全文",
      answer: "我做了抽检",
      roundType: "业务面",
      resumeText: "原始简历全文",
      contextText: renderedContext,
    });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    // 渲染上下文在，带标注
    expect(user).toContain(renderedContext);
    // 裸 JD / 简历 / 兜底句不再出现
    expect(user).not.toContain("【岗位 JD】");
    expect(user).not.toContain("原始 JD 全文");
    expect(user).not.toContain("【候选人简历】");
    expect(user).not.toContain("原始简历全文");
    // 题目和回答有自己的抬头
    expect(user).toContain("【面试问题】\n如何评测？");
    expect(user).toContain("【候选人回答】\n我做了抽检");
  });

  test("appends warnings after the answer", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      status: "needs_more_input", summary: "x", evidence: [], missingEvidence: [],
      dimensions: [], rewritePlan: [], followUp: "y",
    }));

    await evaluateAnswer({
      question: "q", jd: "JD", answer: "a", roundType: "业务面",
      contextText: renderedContext,
      warnings: ["关键内容超出 12000 token 预算，已被舍弃。"],
    });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("⚠ 上下文提示");
    expect(user).toContain("超出 12000 token 预算");
  });

  test("keeps legacy prompt when contextText is absent", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      status: "needs_more_input", summary: "x", evidence: [], missingEvidence: [],
      dimensions: [], rewritePlan: [], followUp: "y",
    }));

    await evaluateAnswer({ question: "q", jd: "裸 JD", answer: "a", roundType: "业务面", resumeText: "裸简历" });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("【岗位 JD】\n裸 JD");
    expect(user).toContain("【候选人简历】\n裸简历");
  });
});

describe("generateInterviewQuestions with contextText", () => {
  beforeEach(() => jest.clearAllMocks());

  test("uses rendered context instead of raw JD and resume", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify([
      {
        q: "问题",
        tips: { intent: "i", keyPoints: ["k"], framework: "f", pitfalls: ["p"], proTips: ["t"] },
      },
    ]));

    await generateInterviewQuestions({
      jd: "裸 JD", roundType: "业务面", count: 1, sessionId: "s1",
      resumeText: "裸简历", contextText: renderedContext,
    });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain(renderedContext);
    expect(user).not.toContain("【岗位 JD】");
    expect(user).not.toContain("裸简历");
    expect(user).toContain("【面试轮次】\n业务面");
  });

  test("falls back to legacy prompt without contextText", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify([
      { q: "问题", tips: { intent: "i", keyPoints: [], framework: "f", pitfalls: [], proTips: [] } },
    ]));

    await generateInterviewQuestions({ jd: "裸 JD", roundType: "技术面", count: 1 });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("【岗位 JD】\n裸 JD");
    expect(user).toContain("【候选人过往记录】\n暂无（用户未上传简历）");
  });
});

describe("summarizeInterview with contextText", () => {
  beforeEach(() => jest.clearAllMocks());

  const assessments = [{
    questionId: "q1", status: "assessed", score: 80,
    summary: "还行", evidence: ["e"], missingEvidence: [],
    dimensions: [{ name: "逻辑性", score: 80, comment: "ok" }],
    rewritePlan: [], followUp: "f",
  }];

  test("replaces the JD block with rendered context; assessments stay as core payload", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      overallScore: 80,
      grade: "B",
      strengths: ["表达清晰"],
      weaknesses: ["缺数据"],
      suggestions: ["补数据"],
      nextActions: [{ title: "补数据", reason: "缺", doneWhen: "能说出数字", priority: "high" }],
    }));

    await summarizeInterview({
      jd: "裸 JD", roundType: "业务面", assessments,
      questions: [{ id: "q1", question_text: "问题一" }],
      contextText: renderedContext,
    });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain(renderedContext);
    expect(user).not.toContain("【岗位 JD】");
    expect(user).not.toContain("裸 JD");
    // 评估列表不进预算，始终在
    expect(user).toContain("【单题评估列表】");
  });

  test("falls back to legacy JD block without contextText", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      overallScore: 80,
      grade: "B",
      strengths: ["表达清晰"],
      weaknesses: ["缺数据"],
      suggestions: ["补数据"],
      nextActions: [{ title: "补数据", reason: "缺", doneWhen: "能说出数字", priority: "high" }],
    }));

    await summarizeInterview({ jd: "裸 JD", roundType: "业务面", assessments });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("【岗位 JD】\n裸 JD");
  });
});

describe("serializeAssessmentsForPrompt guardrail", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns the full list when under the cap", () => {
    const list = [{ questionId: "q1", score: 80, summary: "还行" }];
    const out = serializeAssessmentsForPrompt(list);
    expect(out.text).toBe(JSON.stringify(list, null, 2));
    expect(out.warnings).toHaveLength(0);
  });

  test("slims long-text assessments first and discloses the downgrade", () => {
    const longSummary = "很长的总结。".repeat(2000); // 单条 summary 就远超 cap
    const list = [{ questionId: "q1", score: 80, summary: longSummary }];
    const out = serializeAssessmentsForPrompt(list, 1_000);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.text).toContain("q1");
    // 瘦身后 summary 被截断
    expect(out.text.length).toBeLessThan(longSummary.length);
    expect(out.text).not.toContain(longSummary.slice(0, 300));
  });

  test("keeps only the first N items when still over budget after slimming", () => {
    const list = Array.from({ length: 30 }, (_, i) => ({
      questionId: `q${i + 1}`,
      score: 60 + (i % 30),
      summary: "评估内容若干。".repeat(60),
      dimensions: [{ name: "逻辑性", score: 70, comment: "评语。".repeat(40) }],
    }));
    const out = serializeAssessmentsForPrompt(list, 2_000);
    expect(out.warnings.join("\n")).toContain("仅保留前");
    // 保留的是前缀（与 questionBreakdown 的题目顺序一致）
    expect(out.text).toContain('"q1"');
    expect(out.text).not.toContain('"q30"');
  });

  test("summarizeInterview surfaces guardrail warnings into the prompt", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      overallScore: 80,
      grade: "B",
      strengths: ["表达清晰"],
      weaknesses: ["缺数据"],
      suggestions: ["补数据"],
      nextActions: [{ title: "补数据", reason: "缺", doneWhen: "能说出数字", priority: "high" }],
    }));

    const big = Array.from({ length: 40 }, (_, i) => ({
      questionId: `q${i + 1}`,
      score: 70,
      summary: "总结内容。".repeat(300),
    }));

    await summarizeInterview({ jd: "裸 JD", roundType: "业务面", assessments: big });

    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("⚠ 上下文提示");
    expect(user).toContain("token 护栏");
  });
});