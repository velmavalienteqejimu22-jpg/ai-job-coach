import { evaluateQuickPractice } from "./practice";
import { callLLM } from "@/lib/llm";

jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));

describe("evaluateQuickPractice", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns a bounded, structured coaching result", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      verdict: "证据不足",
      summary: "回答说明了方法，但没有说明个人动作和验证结果。",
      strengths: ["说明了评测目标"],
      gaps: ["缺个人动作", "缺结果指标"],
      followUp: "你具体定义了哪一个指标？",
      improvedOutline: ["先给结论", "说明个人动作", "补充结果"],
    }));

    await expect(evaluateQuickPractice({
      question: "如何判断模型效果变好？",
      answer: "我们做了人工抽检。",
      contextText: "【目标岗位·待确认·用户材料】[job-description]\n负责模型评测\n\n【事实·已确认】[skill-1]\n在生产项目中使用 TypeScript",
    })).resolves.toEqual(expect.objectContaining({
      verdict: "证据不足",
      gaps: ["缺个人动作", "缺结果指标"],
      followUp: "你具体定义了哪一个指标？",
    }));
  });

  test("rejects incomplete model output instead of showing fake feedback", async () => {
    (callLLM as jest.Mock).mockResolvedValue("Hello");
    await expect(evaluateQuickPractice({
      question: "问题", answer: "回答", contextText: "",
    })).rejects.toThrow("AI 返回格式错误");
  });

  test("works without candidate materials by switching to a minimal-feedback system prompt", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      verdict: "可继续追问",
      summary: "没有材料，仅做最小反馈。",
      strengths: [],
      gaps: ["缺材料"],
      followUp: "能补一下相关材料吗？",
      improvedOutline: ["先说背景", "再说动作"],
    }));

    await expect(evaluateQuickPractice({
      question: "你做过什么？",
      answer: "做过一些事情。",
      contextText: "",
    })).resolves.toEqual(expect.objectContaining({ verdict: "可继续追问" }));

    // system prompt 应该带「没有候选人材料」的提示
    const callArgs = (callLLM as jest.Mock).mock.calls[0][0];
    const system = String(callArgs[0].content);
    expect(system).toContain("没有候选人材料");
    // user message 应该明确说未提供材料，而不是装作有
    const user = String(callArgs[1].content);
    expect(user).toContain("本次未提供候选人材料");
    expect(user).not.toContain("本次分析材料：\n");
  });

  test("appends warnings to the user message so the model can react", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      verdict: "证据不足",
      summary: "材料不全。",
      strengths: [], gaps: ["少事实"], followUp: "补一下？",
      improvedOutline: ["补事实"],
    }));

    await evaluateQuickPractice({
      question: "q", answer: "a", contextText: "上下文",
      warnings: ["关键内容超出 2000 token 预算，已被舍弃。"],
    });
    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("⚠ 上下文提示");
    expect(user).toContain("超出 2000 token 预算");
  });

  test("never lets the question or answer appear without their labeled sections", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      verdict: "可继续追问", summary: "x", strengths: [], gaps: [],
      followUp: "y", improvedOutline: ["z"],
    }));

    await evaluateQuickPractice({
      question: "如何评价模型",
      answer: "我做了抽检",
      contextText: "【目标岗位】\nJD",
    });
    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain("面试题：\n如何评价模型");
    expect(user).toContain("候选人回答：\n我做了抽检");
  });
});