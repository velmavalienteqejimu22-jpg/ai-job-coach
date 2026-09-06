import { compileContextBundle, contextIsStale, estimateTokens, replayContextSelection } from "./context";
import type { CareerClaim } from "./types";

const claim = (overrides: Partial<CareerClaim> = {}): CareerClaim => ({
  id: "skill-1",
  entityType: "skill",
  entityKey: "typescript",
  claimType: "proficiency",
  value: "used_in_production",
  displayText: "在生产项目中使用 TypeScript",
  status: "confirmed",
  visibility: "recruiter_safe",
  sourceKind: "user_upload",
  verificationLevel: "user_confirmed",
  updatedAt: "2026-08-14T00:00:00.000Z",
  ...overrides,
});

test("context fingerprint is stable across compile time", () => {
  const first = compileContextBundle({ task: "resume_workshop", userId: "user-1", claims: [claim()], now: new Date("2026-08-14") });
  const second = compileContextBundle({ task: "resume_workshop", userId: "user-1", claims: [claim()], now: new Date("2026-08-15") });
  expect(first.version).toBe(2);
  expect(first.fingerprint).toBe(second.fingerprint);
  expect(first.allowedClaimIds).toEqual(["skill-1"]);
});

test("resume imports stay citable but are not treated as confirmed", () => {
  // PRD §5.2：导入属于用户材料，不能自动写成用户逐条确认。
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ status: "unverified", verificationLevel: "self_reported", sourceKind: "user_upload" })],
  });
  expect(bundle.allowedClaimIds).toEqual([]);
  expect(bundle.unverifiedClaimIds).toEqual(["skill-1"]);
  expect(bundle.blockedClaimIds).toEqual([]);
  // 仍然出现在上下文里，否则「已有材料」会被误判为缺失
  expect(bundle.claims.map((item) => item.id)).toEqual(["skill-1"]);
});

test("model-extracted facts cannot be cited as experience", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim({ id: "ai-1", status: "unverified", sourceKind: "ai_extraction", verificationLevel: "none" })],
  });
  expect(bundle.blockedClaimIds).toEqual(["ai-1"]);
  expect(bundle.claims).toHaveLength(0);
  expect(bundle.selection.excluded).toEqual(
    expect.arrayContaining([expect.objectContaining({ refId: "ai-1", reason: "blocked_source" })]),
  );
});

test("withdrawn and irrelevant claims are excluded with a reason", () => {
  const bundle = compileContextBundle({
    task: "follow_up",
    userId: "user-1",
    claims: [
      claim({ id: "gone", status: "withdrawn" }),
      claim({ id: "offtopic", entityType: "education" }),
      claim({ id: "kept", entityType: "preference", status: "confirmed", verificationLevel: "user_confirmed" }),
    ],
  });
  const reasons = Object.fromEntries(bundle.selection.excluded.map((item) => [item.refId, item.reason]));
  expect(reasons.gone).toBe("withdrawn");
  expect(reasons.offtopic).toBe("task_irrelevant");
  expect(bundle.claims.map((item) => item.id)).toEqual(["kept"]);
});

test("priority drops lower-ranked content before the current question", () => {
  const longHistory = "历史摘要".repeat(400);
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [claim({ id: "c1", displayText: "一段很长的经历描述".repeat(60) })],
    questionSource: { id: "q1", text: "请解释你的 RAG 评估方法" },
    historySummary: { id: "h1", text: longHistory },
    budget: { maxInputTokens: 600 },
  });
  const includedKinds = bundle.selection.included.map((item) => item.kind);
  expect(includedKinds).toContain("question_source");
  expect(includedKinds).not.toContain("history_summary");
  expect(bundle.selection.excluded).toEqual(
    expect.arrayContaining([expect.objectContaining({ refId: "h1", reason: "lower_priority" })]),
  );
  expect(bundle.usage.usedTokens).toBeLessThanOrEqual(600);
});

test("required source that cannot fit is reported instead of silently truncated", () => {
  // PRD §5.1：关键原句装不下时拆任务或请求选择，不能截断后继续作结论。
  const bundle = compileContextBundle({
    task: "mock_interview",
    userId: "user-1",
    claims: [],
    questionSource: { id: "q1", text: "题目原文".repeat(500) },
    budget: { maxInputTokens: 500 },
  });
  expect(bundle.usage.truncated).toBe(true);
  expect(bundle.selection.excluded).toEqual(
    expect.arrayContaining([expect.objectContaining({ refId: "q1", reason: "budget_exhausted" })]),
  );
});

test("direct routes compile with zero model budget", () => {
  const bundle = compileContextBundle({
    task: "resume_workshop",
    userId: "user-1",
    claims: [claim()],
    routeClass: "direct",
  });
  expect(bundle.budget).toMatchObject({ maxInputTokens: 0, maxModelCalls: 0, maxToolCalls: 0 });
  expect(bundle.claims).toHaveLength(0);
});

test("stale runs are detected when the goal or materials change, not on recompile alone", () => {
  const base = { task: "resume_workshop" as const, userId: "user-1", claims: [claim()], opportunity: null, knowledge: [] };
  const before = compileContextBundle(base);
  const same = compileContextBundle(base);
  const changedGoal = compileContextBundle({ ...base, intent: "negotiate_offer" });
  const changedMaterial = compileContextBundle({
    ...base,
    claims: [claim({ status: "unverified", verificationLevel: "self_reported" })],
  });

  expect(contextIsStale(before, same)).toBe(false);
  expect(contextIsStale(before, changedGoal)).toBe(true);
  expect(contextIsStale(before, changedMaterial)).toBe(true);
});

test("token estimate counts CJK heavier than ascii", () => {
  expect(estimateTokens("评测口径")).toBeGreaterThan(estimateTokens("eval"));
  expect(estimateTokens("")).toBe(0);
});

describe("selection reasoning (M1)", () => {
  test("every included entry carries rule + priority + cost + required", () => {
    const bundle = compileContextBundle({
      task: "mock_interview",
      userId: "user-1",
      claims: [claim({ id: "c1" }), claim({ id: "c2", status: "confirmed", verificationLevel: "user_confirmed" })],
      questionSource: { id: "q1", text: "请讲一个你最近负责的项目" },
      currentInput: "我下周要面试字节",
    });
    for (const entry of bundle.selection.included) {
      expect(entry.rule).toMatch(/^(required|priority):/);
      expect(typeof entry.priority).toBe("number");
      expect(entry.estimatedTokens).toBeGreaterThan(0);
      expect(typeof entry.required).toBe("boolean");
    }
    const rules = bundle.selection.included.map((entry) => entry.rule);
    expect(rules).toContain("required:current_input");
    expect(rules).toContain("required:question_source");
    expect(rules).toContain("priority:confirmed_fact");
  });

  test("every excluded entry also carries rule + priority + cost + required", () => {
    const bundle = compileContextBundle({
      task: "follow_up",
      userId: "user-1",
      claims: [
        claim({ id: "gone", status: "withdrawn" }),
        claim({ id: "offtopic", entityType: "education" }),
        // entityType=preference 才能进入 follow_up 的 TASK_CLAIM_TYPES，
        // 让它落到 blocked_source 分支而不是 task_irrelevant
        claim({ id: "extracted", entityType: "preference", status: "unverified", sourceKind: "ai_extraction", verificationLevel: "none" }),
      ],
    });
    expect(bundle.selection.excluded.length).toBeGreaterThanOrEqual(3);
    for (const entry of bundle.selection.excluded) {
      expect(entry.rule).toMatch(/^excluded:/);
      expect(typeof entry.priority).toBe("number");
      expect(entry.cost).toBeGreaterThan(0);
      expect(entry.required).toBe(false);
    }
    const byRef = Object.fromEntries(bundle.selection.excluded.map((item) => [item.refId, item]));
    expect(byRef.gone.rule).toBe("excluded:withdrawn");
    expect(byRef.offtopic.rule).toBe("excluded:task_irrelevant");
    expect(byRef.extracted.rule).toBe("excluded:blocked_source");
  });

  test("required source that gets excluded carries budget_exhausted rule", () => {
    const bundle = compileContextBundle({
      task: "mock_interview",
      userId: "user-1",
      claims: [],
      questionSource: { id: "q1", text: "题目原文".repeat(500) },
      budget: { maxInputTokens: 500 },
    });
    const exhausted = bundle.selection.excluded.find((entry) => entry.refId === "q1");
    expect(exhausted).toBeDefined();
    expect(exhausted?.rule).toBe("excluded:budget_exhausted");
    expect(exhausted?.required).toBe(true);
  });

  test("priority is monotonic across included entries", () => {
    const bundle = compileContextBundle({
      task: "mock_interview",
      userId: "user-1",
      claims: [claim({ id: "c1" }), claim({ id: "c2" })],
      currentInput: "hello",
      questionSource: { id: "q1", text: "题目" },
    });
    for (let i = 1; i < bundle.selection.included.length; i++) {
      expect(bundle.selection.included[i].priority).toBeGreaterThanOrEqual(
        bundle.selection.included[i - 1].priority,
      );
    }
  });
});

describe("replay (M1)", () => {
  const baseInput = {
    task: "resume_workshop" as const,
    userId: "user-1",
    claims: [claim({ id: "c1" }), claim({ id: "c2" })],
    opportunity: null,
    knowledge: [],
  };

  test("identical inputs produce identical fingerprints", () => {
    const before = compileContextBundle(baseInput);
    const after = compileContextBundle(baseInput);
    expect(before.fingerprint).toBe(after.fingerprint);
  });

  test("replay matches when no material has changed", () => {
    const stored = compileContextBundle(baseInput);
    const result = replayContextSelection(stored, baseInput);
    expect(result.matches).toBe(true);
    expect(result.drift).toEqual([]);
    expect(result.currentFingerprint).toBe(stored.fingerprint);
  });

  test("replay detects a newly confirmed claim", () => {
    // stored 时是用户材料（unverified + self_reported），current 升级为 confirmed
    const stored = compileContextBundle({
      ...baseInput,
      claims: [claim({ id: "c1", status: "unverified", verificationLevel: "self_reported" }), claim({ id: "c2" })],
    });
    const currentInput = {
      ...baseInput,
      claims: [claim({ id: "c1", status: "confirmed", verificationLevel: "user_confirmed" }), claim({ id: "c2" })],
    };
    const result = replayContextSelection(stored, currentInput);
    expect(result.matches).toBe(false);
    expect(result.drift).toEqual(
      expect.arrayContaining([expect.objectContaining({ refId: "c1", change: "changed" })]),
    );
  });

  test("replay detects a withdrawn claim", () => {
    const stored = compileContextBundle(baseInput);
    const result = replayContextSelection(stored, {
      ...baseInput,
      claims: [claim({ id: "c1" }), claim({ id: "c2", status: "withdrawn" })],
    });
    expect(result.matches).toBe(false);
    expect(result.drift).toEqual(
      expect.arrayContaining([expect.objectContaining({ refId: "c2", change: "removed" })]),
    );
  });

  test("replay detects a new claim being added", () => {
    const stored = compileContextBundle(baseInput);
    const result = replayContextSelection(stored, {
      ...baseInput,
      claims: [claim({ id: "c1" }), claim({ id: "c2" }), claim({ id: "c3", entityKey: "rag", displayText: "主导 RAG 评测" })],
    });
    expect(result.matches).toBe(false);
    expect(result.drift).toEqual(
      expect.arrayContaining([expect.objectContaining({ refId: "c3", change: "added" })]),
    );
  });

  test("replay returns the same fingerprint as a fresh compile", () => {
    const stored = compileContextBundle(baseInput);
    const result = replayContextSelection(stored, {
      ...baseInput,
      claims: [claim({ id: "c1", status: "confirmed", verificationLevel: "user_confirmed" }), claim({ id: "c2" })],
    });
    const fresh = compileContextBundle({ ...baseInput, claims: [claim({ id: "c1", status: "confirmed", verificationLevel: "user_confirmed" }), claim({ id: "c2" })] });
    expect(result.currentFingerprint).toBe(fresh.fingerprint);
  });

  test("replay agrees with contextIsStale on material changes", () => {
    // stored 是 confirmed，current 是 unverified：同一 claim 状态下降
    const stored = compileContextBundle(baseInput);
    const currentInput = {
      ...baseInput,
      claims: [claim({ id: "c1", status: "unverified", verificationLevel: "self_reported" }), claim({ id: "c2" })],
    };
    const fresh = compileContextBundle(currentInput);
    expect(contextIsStale(stored, fresh)).toBe(true);
    const result = replayContextSelection(stored, currentInput);
    expect(result.matches).toBe(false);
  });
});
