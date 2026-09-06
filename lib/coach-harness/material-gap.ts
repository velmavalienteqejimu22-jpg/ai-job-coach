/**
 * PRD §2：缺少材料必须细分。
 * 系统没读到、当前岗位没关联、确实没有、解析失败，是四种不同的问题，
 * 只有最后确认缺少时才要求补交，不能因为读取失败让用户重填。
 */

export type MaterialKind =
  | "resume"
  | "jd"
  | "project_notes"
  | "interview_notes"
  | "offer_terms"
  | "anything";

export type MaterialGapKind =
  | "available"
  | "not_read"
  | "not_linked"
  | "parse_failed"
  | "genuinely_missing";

export type MaterialRecovery =
  | "none"
  | "retry_read"
  | "link_to_opportunity"
  | "alternative_format"
  | "ask_user";

export interface MaterialGap {
  material: MaterialKind;
  kind: MaterialGapKind;
  /** 只有 confirmed 缺失才可能阻止动作；读取和关联问题都有替代路径。 */
  blocking: boolean;
  /** 是否要把这条暴露给用户。可用或已由系统自行修复的不打扰。 */
  userVisible: boolean;
  message: string;
  recovery: MaterialRecovery;
  /** 关联到哪一条材料，便于用户点开看原文。 */
  sourceId?: string | null;
}

export interface MaterialProbe {
  material: MaterialKind;
  /** 有没有这份材料的记录。 */
  sourceExists: boolean;
  sourceId?: string | null;
  /** 读到的内容长度，0 表示空。 */
  contentLength: number;
  parse: { status: "ok" | "empty" | "failed"; reason?: string | null };
  /** 这份材料当前挂在哪个岗位下，null 表示属于通用材料。 */
  linkedOpportunityId?: string | null;
  /** 本次任务针对的岗位。 */
  currentOpportunityId?: string | null;
}

const MATERIAL_LABEL: Record<MaterialKind, string> = {
  resume: "简历",
  jd: "岗位描述",
  project_notes: "项目经历",
  interview_notes: "面试记录",
  offer_terms: "offer 条款",
  anything: "材料",
};

export function classifyMaterialGap(probe: MaterialProbe): MaterialGap {
  const label = MATERIAL_LABEL[probe.material];

  // 解析失败优先：用户已经给了材料，是系统没处理好。
  // 不能因此让用户重填同一份文件，只提示换一种格式。
  if (probe.parse.status === "failed") {
    return {
      material: probe.material,
      kind: "parse_failed",
      blocking: false,
      userVisible: true,
      message: `${label}解析失败${probe.parse.reason ? `（${probe.parse.reason}）` : ""}。请换一种格式或粘贴文字，不要重复上传同一个文件。`,
      recovery: "alternative_format",
      sourceId: probe.sourceId ?? null,
    };
  }

  // 有记录但读不到内容：系统没读到，不是用户没有。
  if (probe.sourceExists && probe.contentLength === 0) {
    return {
      material: probe.material,
      kind: "not_read",
      blocking: false,
      userVisible: true,
      message: `已保存的${label}没有读到内容，正在重试读取。重试仍失败会请你换一种格式。`,
      recovery: "retry_read",
      sourceId: probe.sourceId ?? null,
    };
  }

  // 材料存在但挂在别的岗位下：不是缺失，是没关联。
  if (
    probe.sourceExists
    && probe.linkedOpportunityId
    && probe.currentOpportunityId
    && probe.linkedOpportunityId !== probe.currentOpportunityId
  ) {
    return {
      material: probe.material,
      kind: "not_linked",
      blocking: false,
      userVisible: true,
      message: `已有一份${label}，但还没有关联到当前岗位。确认后即可复用，不需要重新上传。`,
      recovery: "link_to_opportunity",
      sourceId: probe.sourceId ?? null,
    };
  }

  if (!probe.sourceExists || probe.contentLength === 0) {
    return {
      material: probe.material,
      kind: "genuinely_missing",
      blocking: true,
      userVisible: true,
      message: `还没有${label}。缺了它这一步做不下去，可以先给一份，也可以先做不需要它的任务。`,
      recovery: "ask_user",
      sourceId: probe.sourceId ?? null,
    };
  }

  return {
    material: probe.material,
    kind: "available",
    blocking: false,
    userVisible: false,
    message: "",
    recovery: "none",
    sourceId: probe.sourceId ?? null,
  };
}

/**
 * 汇总多个材料的缺口。
 * 只有确实缺失才阻止动作；读取、解析、关联问题一律给替代路径。
 */
export function summarizeMaterialGaps(probes: MaterialProbe[]): {
  blocking: MaterialGap[];
  recoverable: MaterialGap[];
  /** 给用户的唯一一句话。没有缺口时为空。 */
  headline: string | null;
  primaryRecovery: MaterialRecovery;
} {
  const gaps = probes.map(classifyMaterialGap);
  const blocking = gaps.filter((gap) => gap.blocking);
  const recoverable = gaps.filter((gap) => !gap.blocking && gap.userVisible);

  if (blocking.length) {
    return {
      blocking,
      recoverable,
      headline: blocking[0].message,
      primaryRecovery: blocking[0].recovery,
    };
  }
  if (recoverable.length) {
    return {
      blocking: [],
      recoverable,
      headline: recoverable[0].message,
      primaryRecovery: recoverable[0].recovery,
    };
  }
  return { blocking: [], recoverable: [], headline: null, primaryRecovery: "none" };
}

/** 首次进入时只问「你现在最想推进什么」，不因为缺 JD 就阻止通用任务。 */
export function firstMissingMaterialFor(task: "learn" | "apply" | "interview" | "negotiate"): MaterialKind | null {
  if (task === "learn") return null;
  if (task === "apply") return "resume";
  if (task === "interview") return null;
  return "offer_terms";
}
