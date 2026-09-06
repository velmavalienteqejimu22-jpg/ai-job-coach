import {
  classifyMaterialGap,
  firstMissingMaterialFor,
  summarizeMaterialGaps,
  type MaterialProbe,
} from "./material-gap";

const probe = (overrides: Partial<MaterialProbe> = {}): MaterialProbe => ({
  material: "resume",
  sourceExists: true,
  contentLength: 1200,
  parse: { status: "ok" },
  linkedOpportunityId: null,
  currentOpportunityId: null,
  ...overrides,
});

describe("material gap classification", () => {
  test("available material is not surfaced to the user", () => {
    const gap = classifyMaterialGap(probe());
    expect(gap.kind).toBe("available");
    expect(gap.blocking).toBe(false);
    expect(gap.userVisible).toBe(false);
  });

  test("parse failure is our problem, not the user's missing file", () => {
    // PRD §2：不能因为读取失败让用户重填。
    const gap = classifyMaterialGap(probe({ parse: { status: "failed", reason: "扫描件无文字层" } }));
    expect(gap.kind).toBe("parse_failed");
    expect(gap.blocking).toBe(false);
    expect(gap.recovery).toBe("alternative_format");
    expect(gap.message).toContain("不要重复上传");
  });

  test("saved but unreadable material is a read problem", () => {
    const gap = classifyMaterialGap(probe({ contentLength: 0 }));
    expect(gap.kind).toBe("not_read");
    expect(gap.blocking).toBe(false);
    expect(gap.recovery).toBe("retry_read");
  });

  test("material attached to another job is not missing", () => {
    const gap = classifyMaterialGap(probe({
      linkedOpportunityId: "11111111-1111-1111-1111-111111111111",
      currentOpportunityId: "22222222-2222-2222-2222-222222222222",
    }));
    expect(gap.kind).toBe("not_linked");
    expect(gap.blocking).toBe(false);
    expect(gap.recovery).toBe("link_to_opportunity");
    expect(gap.message).toContain("不需要重新上传");
  });

  test("only genuinely missing material blocks the action", () => {
    const gap = classifyMaterialGap(probe({ sourceExists: false, contentLength: 0 }));
    expect(gap.kind).toBe("genuinely_missing");
    expect(gap.blocking).toBe(true);
    expect(gap.recovery).toBe("ask_user");
  });
});

describe("summarizeMaterialGaps", () => {
  test("recoverable problems never block the task", () => {
    const summary = summarizeMaterialGaps([
      probe({ material: "jd", parse: { status: "failed" } }),
      probe({ material: "resume", contentLength: 0 }),
    ]);
    expect(summary.blocking).toHaveLength(0);
    expect(summary.recoverable).toHaveLength(2);
    expect(summary.headline).toContain("解析失败");
    expect(summary.primaryRecovery).toBe("alternative_format");
  });

  test("missing material blocks with a single clear ask", () => {
    const summary = summarizeMaterialGaps([
      probe({ material: "resume", sourceExists: false, contentLength: 0 }),
    ]);
    expect(summary.blocking).toHaveLength(1);
    expect(summary.primaryRecovery).toBe("ask_user");
  });

  test("no gaps means no message", () => {
    const summary = summarizeMaterialGaps([probe(), probe({ material: "jd" })]);
    expect(summary.headline).toBeNull();
    expect(summary.primaryRecovery).toBe("none");
  });
});

describe("entry points do not demand irrelevant material", () => {
  test("learning from zero needs nothing", () => {
    expect(firstMissingMaterialFor("learn")).toBeNull();
  });

  test("interview prep does not require a JD first", () => {
    expect(firstMissingMaterialFor("interview")).toBeNull();
  });

  test("negotiation asks for offer terms, not a full resume", () => {
    // PRD 验收场景 17：谈薪用户不该被要求先上第一课或交完整简历。
    expect(firstMissingMaterialFor("negotiate")).toBe("offer_terms");
  });
});
