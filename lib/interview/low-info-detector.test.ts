import {
  buildHelpBranch,
  buildNeedsMoreInputAssessment,
  detectAnswerGap,
  detectLowInfoAnswer,
  extractConcreteSignals,
} from "./low-info-detector";

describe("detectLowInfoAnswer", () => {
  test("detects empty answer", () => {
    expect(detectLowInfoAnswer("")).toEqual({ isLowInfo: true, reason: "empty" });
    expect(detectLowInfoAnswer("   ")).toEqual({ isLowInfo: true, reason: "empty" });
  });

  test("detects punctuation-only answer", () => {
    expect(detectLowInfoAnswer("？？？")).toEqual({ isLowInfo: true, reason: "punctuation_only" });
    expect(detectLowInfoAnswer("...")).toEqual({ isLowInfo: true, reason: "punctuation_only" });
    expect(detectLowInfoAnswer("，，，")).toEqual({ isLowInfo: true, reason: "punctuation_only" });
  });

  test("detects exact-match placeholder words", () => {
    const placeholders = ["不会", "不知道", "不清楚", "没印象", "忘了", "不记得",
      "不知道啊", "我不会", "我觉得还行", "还好", "一般般", "差不多", "还行吧",
      "可以", "不好", "不好说", "这个问题我没想过", "没了解过", "暂时没有"];
    for (const p of placeholders) {
      expect(detectLowInfoAnswer(p)).toEqual({ isLowInfo: true, reason: "placeholder" });
    }
  });

  test("separates never-done from not-knowing", () => {
    // PRD §3.5：没有做过 ≠ 不懂概念。前者禁止生成经历，后者给讲解。
    for (const phrase of ["没有", "没做过", "没经验", "没接触过", "没落地过"]) {
      expect(detectAnswerGap(phrase)).toMatchObject({ kind: "never_done", isLowInfo: true });
    }
  });

  test("detects too-short answers", () => {
    expect(detectLowInfoAnswer("嗯嗯")).toEqual({ isLowInfo: true, reason: "trailing_placeholder" });
    expect(detectLowInfoAnswer("哈哈")).toEqual({ isLowInfo: true, reason: "too_short" });
  });

  test("detects repeated characters", () => {
    expect(detectLowInfoAnswer("啊啊啊")).toEqual({ isLowInfo: true, reason: "repeated_char" });
    expect(detectLowInfoAnswer("嗯嗯嗯嗯")).toEqual({ isLowInfo: true, reason: "repeated_char" });
  });

  test("detects repeated words", () => {
    expect(detectLowInfoAnswer("不知道不知道不知道")).toEqual({ isLowInfo: true, reason: "repeated_word" });
    expect(detectLowInfoAnswer("不会不会不会")).toEqual({ isLowInfo: true, reason: "repeated_word" });
  });

  test("detects trailing placeholder in short answers", () => {
    expect(detectLowInfoAnswer("可以嗯嗯")).toEqual({ isLowInfo: true, reason: "trailing_placeholder" });
  });

  test("accepts valid long answers", () => {
    expect(detectLowInfoAnswer("在上一份工作中，我负责了用户增长项目，通过A/B测试优化了注册流程，转化率提升了15%")).toEqual({ isLowInfo: false });
    expect(detectLowInfoAnswer("我使用STAR法则来回答这个问题。Situation是...")).toEqual({ isLowInfo: false });
    expect(detectLowInfoAnswer("这个问题我之前遇到过，当时我们团队面临了用户留存率下降的问题，我分析了数据后发现...")).toEqual({ isLowInfo: false });
  });

  test("accepts short but meaningful answers", () => {
    expect(detectLowInfoAnswer("我主导了这个项目")).toEqual({ isLowInfo: false });
    expect(detectLowInfoAnswer("转化率提升了15个百分点")).toEqual({ isLowInfo: false });
  });

  test("accepts short answers that carry concrete evidence", () => {
    // PRD 验收场景 4：回答短但准确，不能被机械判成低信息而强制补字数。
    const shortButAccurate = ["用了 RAG", "召回率 92%", "QPS 200", "LangChain", "做了 A/B", "提升了3倍"];
    for (const answer of shortButAccurate) {
      expect(detectAnswerGap(answer)).toMatchObject({ kind: "none", isLowInfo: false });
    }
    expect(extractConcreteSignals("用了 RAG")).toContain("RAG");
    expect(extractConcreteSignals("召回率 92%")).toContain("92%");
  });

  test("still blocks short answers without any concrete signal", () => {
    expect(detectAnswerGap("还行吧")).toMatchObject({ kind: "placeholder", isLowInfo: true });
    expect(detectAnswerGap("挺好的")).toMatchObject({ kind: "too_short", isLowInfo: true });
  });
});

describe("buildHelpBranch", () => {
  test("never blocks the user from moving on", () => {
    // PRD §2：未掌握不等于禁止浏览下一题。
    for (const gap of ["empty", "placeholder", "never_done", "repeated", "too_short"] as const) {
      const branch = buildHelpBranch({ gap });
      expect(branch.canAdvance).toBe(true);
      expect(branch.advanceLabel).toBeTruthy();
    }
  });

  test("offers help, a micro lesson and guided practice", () => {
    const branch = buildHelpBranch({ gap: "placeholder" });
    const ids = branch.options.map((option) => option.id);
    expect(ids).toEqual(expect.arrayContaining(["explain_directly", "let_me_try", "micro_lesson", "guided_practice", "back_to_question"]));
  });

  test("never-done gets an honest gap explanation instead of a script to memorize", () => {
    // PRD §3.5：没有做过 → 说明经验缺口并给可完成的小实验，不编造项目。
    const branch = buildHelpBranch({ gap: "never_done" });
    const ids = branch.options.map((option) => option.id);
    expect(ids).toContain("guided_practice");
    expect(branch.options.find((option) => option.id === "guided_practice")?.description).toContain("实验");
    expect(branch.recordNote).toContain("禁止");
  });

  test("urgent mode compresses the explanation but still records it", () => {
    const urgent = buildHelpBranch({ gap: "placeholder", urgent: true });
    expect(urgent.urgent).toBe(true);
    expect(urgent.options.find((option) => option.id === "explain_directly")?.description).toContain("最关键");
    expect(urgent.recordNote).toBeTruthy();
  });

  test("asking for help is never counted as mastery", () => {
    const branch = buildHelpBranch({ gap: "placeholder" });
    expect(branch.recordNote).toContain("不计入掌握");
  });
});

describe("buildNeedsMoreInputAssessment", () => {
  test("returns correct needs_more_input structure", () => {
    const result = buildNeedsMoreInputAssessment("empty");
    expect(result.status).toBe("needs_more_input");
    expect(result.score).toBeNull();
    expect(result.evidence).toEqual([]);
    expect(result.followUp).toBeTruthy();
    expect(result.rewritePlan.length).toBeGreaterThan(0);
    expect(result.helpBranch.status).toBe("needs_help");
  });

  test("generates appropriate follow-up for different reasons", () => {
    expect(buildNeedsMoreInputAssessment("empty").followUp).toContain("具体做法");
    expect(buildNeedsMoreInputAssessment("too_short").followUp).toContain("补齐");
    expect(buildNeedsMoreInputAssessment("placeholder").followUp).toContain("讲一遍");
    expect(buildNeedsMoreInputAssessment("never_done").followUp).toContain("缺口");
  });

  test("everything is free at the help branch, so a stuck user is never charged to get unstuck", () => {
    const result = buildNeedsMoreInputAssessment("never_done");
    expect(result.helpBranch.options.every((option) => option.cost === "free")).toBe(true);
  });
});
