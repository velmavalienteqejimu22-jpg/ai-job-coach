import {
  ContextBudgetExceededError,
  assertContextFits,
  buildPromptContext,
  isExcludedRule,
  renderCitableFactsForPrompt,
  renderContextForPrompt,
} from "./prompt";
import { compileContextBundle } from "./context";
import type { CareerClaim } from "./types";

const claim = (overrides: Partial<CareerClaim> = {}): CareerClaim => ({
  id: "skill-1",
  entityType: "skill",
  entityKey: "typescript",
  claimType: "proficiency",
  value: "used_in_production",
  displayText: "在生产项目中使用 TypeScript",
  sourceExcerpt: null,
  status: "confirmed",
  visibility: "recruiter_safe",
  sourceKind: "user_upload",
  verificationLevel: "user_confirmed",
  updatedAt: "2026-08-14T00:00:00.000Z",
  ...overrides,
});

test("rendered sections follow selection.included order exactly", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [claim({ id: "c1" }), claim({ id: "c2", entityKey: "rag", displayText: "主导 RAG 评测" })],
    currentInput: "我下周面试字节",
    questionSource: { id: "q1", text: "讲一个你负责的项目" },
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.sections.map((s) => s.refId)).toEqual(
    bundle.selection.included.map((e) => e.refId),
  );
  expect(rendered.sections[0].kind).toBe("current_input");
  expect(rendered.sections[1].kind).toBe("question_source");
});

test("every selected kind renders its own text", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [claim({ id: "c1" })],
    currentInput: "我要面试",
    questionSource: { id: "q1", text: "讲一个项目" },
    historySummary: { id: "h1", text: "上次练习情况" },
    opportunity: { id: "o1", company: "字节", role: "AI PM", stage: "面试", jdText: "JD 内容", jdVersion: 1 },
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.text).toContain("我要面试");
  expect(rendered.text).toContain("讲一个项目");
  expect(rendered.text).toContain("字节");
  expect(rendered.text).toContain("在生产项目中使用 TypeScript");
  expect(rendered.text).toContain("上次练习情况");
  for (const section of rendered.sections) {
    expect(section.text.trim().length).toBeGreaterThan(0);
  }
});

test("refId markers survive so model output can be traced back", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "resume-line-7", displayText: "负责推荐系统重排" })],
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.text).toContain("[resume-line-7]");
});

test("unverified facts are labelled so the model does not treat them as confirmed", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "c1", status: "unverified", verificationLevel: "self_reported" })],
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.text).toContain("待确认·用户材料");
  expect(rendered.text).not.toContain("【事实·已确认】");
});

test("retrieved knowledge is marked as not citable", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    knowledge: [{
      id: "k1", title: "RAG 评测", description: "描述", goal: "目标", scope: "范围",
      confidence: "medium", evidenceUrls: [],
    }],
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.text).toContain("知识库");
  expect(rendered.text).toContain("不可写进对外材料");
});

test("rendered tokens never exceed the budget", () => {
  const longFacts = Array.from({ length: 40 }, (_, i) =>
    claim({ id: `c${i}`, entityKey: `k${i}`, displayText: `第 ${i} 条很长的经历描述`.repeat(30) }));
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: longFacts,
    budget: { maxInputTokens: 3_000 },
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.usedTokens).toBeLessThanOrEqual(3_000);
  // 装了多少条就渲染多少条，渲染器不做二次裁剪，也不偷偷多塞
  expect(rendered.sections.length).toBe(bundle.selection.included.length);
  expect(rendered.sections.length).toBeLessThan(longFacts.length);
});

test("assertContextFits rejects a context whose required source did not fit", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    questionSource: { id: "q1", text: "题目原文".repeat(500) },
    budget: { maxInputTokens: 500 },
  });
  expect(bundle.usage.truncated).toBe(true);
  expect(() => assertContextFits(bundle)).toThrow(ContextBudgetExceededError);
  expect(() => assertContextFits(bundle)).toThrow(/装不进 500 token 预算/);
});

test("budget error carries the blocked entries so the UI can offer choices", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    questionSource: { id: "q1", text: "题目原文".repeat(500) },
    budget: { maxInputTokens: 500 },
  });
  try {
    assertContextFits(bundle);
    throw new Error("should have thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(ContextBudgetExceededError);
    const budgetError = error as ContextBudgetExceededError;
    expect(budgetError.blocked.length).toBeGreaterThan(0);
    expect(budgetError.blocked[0]).toMatchObject({ kind: "question_source", refId: "q1" });
    expect(budgetError.blocked[0].cost).toBeGreaterThan(500);
    expect(budgetError.status).toBe(422);
  }
});

test("assertContextFits stays silent when only optional content was dropped", () => {
  // 非 required 的事实被预算舍弃是正常行为，不应该 fail-loud
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: Array.from({ length: 40 }, (_, i) =>
      claim({ id: `c${i}`, entityKey: `k${i}`, displayText: `经历 ${i}`.repeat(40) })),
    budget: { maxInputTokens: 1_200 },
  });
  expect(bundle.selection.excluded.length).toBeGreaterThan(0);
  expect(bundle.usage.truncated).toBe(false);
  expect(() => assertContextFits(bundle)).not.toThrow();
});

test("truncated contexts surface a warning even when rendering succeeds", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    questionSource: { id: "q1", text: "题目".repeat(500) },
    budget: { maxInputTokens: 500 },
  });
  const rendered = renderContextForPrompt(bundle);
  expect(rendered.truncated).toBe(true);
  expect(rendered.warnings.join(" ")).toContain("拆任务");
});

test("missing source text is reported instead of silently rendering nothing", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "c1" })],
  });
  // 手动破坏完整性：selection 说装了，但内容不在 bundle 里
  const broken = { ...bundle, claims: [] };
  const rendered = renderContextForPrompt(broken);
  expect(rendered.warnings.join(" ")).toContain("找不到原文");
  expect(rendered.sections).toHaveLength(0);
});

test("citable facts renderer never resurrects facts the budget dropped", () => {
  const longFacts = Array.from({ length: 30 }, (_, i) =>
    claim({ id: `c${i}`, entityKey: `k${i}`, displayText: `第 ${i} 条经历`.repeat(40) }));
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: longFacts,
    budget: { maxInputTokens: 1_500 },
  });
  const rendered = renderCitableFactsForPrompt(bundle);
  const includedFactIds = new Set(
    bundle.selection.included.filter((e) => e.kind === "confirmed_fact").map((e) => e.refId),
  );
  for (const id of rendered.ids) {
    expect(includedFactIds.has(id)).toBe(true);
  }
  expect(rendered.ids.length).toBeLessThan(longFacts.length);
});

test("citable facts renderer skips private claims", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [
      claim({ id: "public-1", visibility: "recruiter_safe" }),
      claim({ id: "private-1", entityKey: "salary", displayText: "期望薪资 50k", visibility: "private" }),
    ],
  });
  const rendered = renderCitableFactsForPrompt(bundle);
  expect(rendered.ids).toContain("public-1");
  expect(rendered.ids).not.toContain("private-1");
  expect(rendered.text).not.toContain("期望薪资");
});

test("citable facts report how many tokens they consume", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "c1" }), claim({ id: "c2", entityKey: "rag", displayText: "主导 RAG 评测" })],
  });
  const rendered = renderCitableFactsForPrompt(bundle);
  expect(rendered.usedTokens).toBeGreaterThan(0);
  expect(rendered.usedTokens).toBeLessThanOrEqual(bundle.budget.maxInputTokens);
});

test("citable facts keep the [id] format the drafting prompt contract depends on", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "resume-line-3", displayText: "负责搜索排序" })],
  });
  const rendered = renderCitableFactsForPrompt(bundle);
  expect(rendered.text).toBe("[resume-line-3] 负责搜索排序");
});

test("buildPromptContext guards before rendering", () => {
  const ok = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "c1" })],
  });
  expect(buildPromptContext(ok, { header: "任务：改写简历" }).text).toContain("任务：改写简历");

  const overflow = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    questionSource: { id: "q1", text: "题目".repeat(500) },
    budget: { maxInputTokens: 500 },
  });
  expect(() => buildPromptContext(overflow)).toThrow(ContextBudgetExceededError);
});

test("isExcludedRule distinguishes drops from keeps", () => {
  expect(isExcludedRule("excluded:lower_priority")).toBe(true);
  expect(isExcludedRule("required:current_input")).toBe(false);
  expect(isExcludedRule("priority:confirmed_fact")).toBe(false);
});

test("excludeKinds skips question_source and current_input so prompt can have its own labeled sections", () => {
  // 单题练习 prompt 自己有「面试题 / 候选人回答」两段，question_source 和
  // current_input 在上下文里再出现一次会让模型读两遍，反而干扰判断。
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [claim({ id: "c1" })],
    currentInput: "我做了抽检",
    questionSource: { id: "q1", text: "如何判断模型效果变好？" },
  });
  const rendered = renderContextForPrompt(bundle, { excludeKinds: ["question_source", "current_input"] });
  expect(rendered.sections.map((s) => s.kind)).not.toContain("question_source");
  expect(rendered.sections.map((s) => s.kind)).not.toContain("current_input");
  expect(rendered.text).not.toContain("如何判断模型效果变好");
  expect(rendered.text).not.toContain("我做了抽检");
  // 但事实仍然出现在上下文里
  expect(rendered.text).toContain("在生产项目中使用 TypeScript");
  // 选择审计本身没有变：只是渲染时跳过
  expect(bundle.selection.included.some((e) => e.kind === "question_source")).toBe(true);
  expect(bundle.selection.included.some((e) => e.kind === "current_input")).toBe(true);
});

test("buildPromptContext forwards excludeKinds to the renderer", () => {
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    currentInput: "回答",
    questionSource: { id: "q1", text: "题目" },
  });
  const rendered = buildPromptContext(bundle, { excludeKinds: ["question_source", "current_input"] });
  expect(rendered.sections.some((s) => s.kind === "question_source")).toBe(false);
});
