export type CoachActionType =
  | "job_decision"
  | "resume_workshop"
  | "project_deep_dive"
  | "mock_interview"
  | "interview_review"
  | "follow_up"
  | "application_assist"
  | "offer_negotiation";

export type CoachExecutor = "hosted_api" | "personal_agent" | "browser_extension";
export type ClaimStatus = "confirmed" | "unverified" | "conflicted" | "withdrawn";
export type ClaimVisibility = "private" | "recruiter_safe" | "public";

/**
 * 事实来自哪里。
 * PRD §5.2：导入、自述、用户确认、外部核验必须分开。
 * user_upload 只是「用户把材料给了系统」，不等于用户逐条确认。
 */
export type SourceKind =
  | "user_upload"
  | "user_statement"
  | "ai_extraction"
  | "external_verification"
  | "system_inference"
  | "migrated_legacy";

/** 被核验到什么程度。决定是否提醒，不决定是否可用。 */
export type VerificationLevel = "none" | "self_reported" | "user_confirmed" | "externally_verified";

/** 只有这三个来源可以写进对外材料；ai_extraction / system_inference 一律不可。 */
export const CITABLE_SOURCE_KINDS: readonly SourceKind[] = [
  "user_upload",
  "user_statement",
  "external_verification",
];

export function isCitableSource(kind: SourceKind): boolean {
  return CITABLE_SOURCE_KINDS.includes(kind);
}

export interface CareerClaim {
  id: string;
  entityType: "profile" | "experience" | "project" | "skill" | "metric" | "preference" | "education";
  entityKey: string;
  claimType: string;
  value: unknown;
  displayText: string;
  sourceExcerpt?: string | null;
  sourceId?: string | null;
  status: ClaimStatus;
  visibility: ClaimVisibility;
  sourceKind: SourceKind;
  verificationLevel: VerificationLevel;
  /** 非空表示确认状态是迁移继承的，不是本次用户确认的结果。 */
  migratedFrom?: string | null;
  updatedAt?: string;
}

export interface OpportunityContext {
  id: string;
  company: string;
  role: string;
  stage: string;
  jdText?: string | null;
  jdVersion: number;
  scheduledInterviewAt?: string | null;
}

export interface ArtifactReference {
  id: string;
  artifactType: string;
  version: number;
  title: string;
  status: string;
  content: unknown;
  claimIds: string[];
  createdAt: string;
  /** 谁写的决定了它能不能被当成事实来源。AI 草稿只是草稿。 */
  createdBy?: "user" | "hosted_ai" | "personal_agent" | "system";
}

export type OpportunitySnapshotType =
  | "jd"
  | "base_resume"
  | "submitted_resume"
  | "application_answers"
  | "interview_brief"
  | "interview_feedback"
  | "outcome";

export interface OpportunitySnapshot {
  id: string;
  opportunityId: string;
  snapshotType: OpportunitySnapshotType;
  version: number;
  title: string;
  content: unknown;
  contentHash: string;
  createdBy: "user" | "hosted_ai" | "personal_agent" | "system";
  frozenAt: string;
}

export type ArtifactReviewType = "independent_ai" | "facts" | "ats" | "pdf";
export type ArtifactReviewStatus = "passed" | "warning" | "failed" | "not_run";

export interface ArtifactQualityReview {
  id: string;
  artifactId: string;
  reviewerType: ArtifactReviewType;
  status: ArtifactReviewStatus;
  summary: string;
  findings: unknown[];
  createdAt: string;
}

export interface ApplicationQualityGate {
  artifactId: string;
  version: number;
  status: "draft" | "ready" | "blocked";
  reviews: ArtifactQualityReview[];
}

/**
 * PRD §5.6 成本与调度硬边界。
 * direct = 0 次模型调用；single_inference = 最多 1 次；bounded_orchestration = 有界 loop。
 */
export type RouteClass = "direct" | "single_inference" | "bounded_orchestration";

/** 三类路由的默认预算。12k 是复杂调用的设计上限，不是默认装满。 */
export const DEFAULT_ROUTE_BUDGET: Record<RouteClass, Omit<ContextBudget, "routeClass">> = {
  direct: { maxInputTokens: 0, maxModelCalls: 0, maxToolCalls: 0 },
  single_inference: { maxInputTokens: 2_000, maxModelCalls: 1, maxToolCalls: 1 },
  bounded_orchestration: { maxInputTokens: 12_000, maxModelCalls: 3, maxToolCalls: 6 },
};

export interface ContextBudget {
  routeClass: RouteClass;
  maxInputTokens: number;
  maxModelCalls: number;
  maxToolCalls: number;
}

/** Context 里每一块的可信类型。 */
export type TrustType =
  | "user_input"
  | "user_material"
  | "user_confirmed"
  | "externally_verified"
  | "retrieved_knowledge"
  | "ai_derived";

export type ContextItemKind =
  | "current_input"
  | "question_source"
  | "attachment"
  | "opportunity"
  | "artifact"
  | "confirmed_fact"
  | "recent_practice"
  | "knowledge"
  | "history_summary";

/**
 * 本次运行附带的原文材料（粘贴的简历、JD、面经等）。
 *
 * 之所以要有这个槽位：一次运行常常不止一份原文，比如单题练习同时需要
 * 「题目 + 简历 + JD」。以前只有一个 questionSource 槽位，route 只能把
 * 几份原文拼成一个字符串塞进去——那样每条材料就没有独立的 refId 和
 * token 成本，被预算舍弃时说不清是哪一份，也就无从让用户选择保留什么。
 */
export interface ContextAttachment {
  id: string;
  label: string;
  text: string;
  /** 少数材料缺了就没法作答（比如逐字稿）。默认 false：装不下就降级，不打断用户。 */
  required?: boolean;
}

/**
 * Context 选择的规则代码。前缀分类：
 *   required:  缺它就不能继续，必须装下；预算不够就 fail-loud。
 *   priority:  按 PRIORITY_ORDER 填进预算的常规物料。
 *   excluded:  主动舍掉的物料，reason 字段说明为什么。
 *
 * 用机器可读代码让人读 reason 双轨：UI 可按 rule 决定颜色/图标/可恢复操作，
 * 服务端也能根据 stored rule 复算决策路径（可回放）。
 */
export type SelectionRule =
  | "required:current_input"
  | "required:question_source"
  | "required:attachment"
  | "priority:attachment"
  | "required:opportunity"
  | "priority:confirmed_fact"
  | "priority:recent_practice"
  | "priority:artifact"
  | "priority:knowledge"
  | "priority:history_summary"
  | "excluded:withdrawn"
  | "excluded:task_irrelevant"
  | "excluded:blocked_source"
  | "excluded:budget_exhausted"
  | "excluded:lower_priority";

export interface ContextSelectionEntry {
  kind: ContextItemKind;
  refId: string;
  refVersion?: string | null;
  trustType: TrustType;
  reason: string;
  estimatedTokens: number;
  /** 触发此次选择的具体规则。UI 与回放都靠这个字段。 */
  rule: SelectionRule;
  /** 在 PRIORITY_ORDER 中的序号。0 最先装。 */
  priority: number;
  /** required=true 时预算装不下会触发 budget_exhausted，触发后必须让用户选。 */
  required: boolean;
}

export type ContextExclusionReason =
  | "budget_exhausted"
  | "out_of_scope"
  | "task_irrelevant"
  | "withdrawn"
  | "blocked_source"
  | "lower_priority";

export interface ContextExclusionEntry {
  kind: ContextItemKind;
  refId: string;
  reason: ContextExclusionReason;
  detail: string;
  /** 触发舍弃的规则代码。和 included.rule 对齐，便于 UI 统一渲染。 */
  rule: SelectionRule;
  /** 如果能装下，会是 PRIORITY_ORDER 中第几位。便于回放时判断"差几个 token 就能装"。 */
  priority: number;
  /** 评估的 token 成本。即便没装进 context 也算出来，给回放使用。 */
  cost: number;
  /** 对应物料是否标记为 required。本系统里 excluded 通常 required=false。 */
  required: boolean;
}

/**
 * 回放结果：把"当前数据"再跑一遍 compileContextBundle，
 * 对比 stored 的 selection，找出漂移。
 * matches=true 表示 stored 的 fingerprint 与当前重算一致，
 * 直接复用 stored context 的建议即可；false 则用 drift 提示用户材料已变。
 */
export interface ContextReplayResult {
  matches: boolean;
  drift: Array<{
    kind: ContextItemKind;
    refId: string;
    change: "added" | "removed" | "changed";
    detail: string;
  }>;
  currentFingerprint: string;
  storedFingerprint: string;
}

export interface ContextBundle {
  version: 2;
  task: CoachActionType;
  userId: string;
  /** 本次运行要达成什么。谈薪只载入本次 offer 条款，改一句话不读取完整学习史。 */
  intent: string | null;
  planVersion: number | null;
  /** 跨岗位比较必须明确选中对象，背景不能串用。 */
  selectedOpportunityIds: string[];
  deadline: string | null;
  userOverride: boolean;
  opportunity: OpportunityContext | null;
  claims: CareerClaim[];
  artifacts: ArtifactReference[];
  knowledge: Array<{
    id: string;
    title: string;
    description: string;
    goal: string;
    scope: string;
    confidence: "low" | "medium" | "high";
    evidenceUrls: string[];
  }>;
  knowledgeContext: string;
  /**
   * 本次编译收到的原文。selection.included 只存「选了哪条」的元信息，
   * 渲染 prompt 时要按 refId 取回原文——存进来才能让渲染器是纯函数、
   * 也让已落库的 contextSnapshot 可独立重渲染（可回放）。
   */
  currentInput: string | null;
  questionSource: { id: string; text: string; version?: string | null } | null;
  historySummary: { id: string; text: string } | null;
  /** 本次运行附带的原文材料，只有被 selection 装下的才会留在这里。 */
  attachments: Array<{ id: string; label: string; text: string; required: boolean }>;
  /** 可写进对外材料：来源可引用且状态可用。 */
  allowedClaimIds: string[];
  /** 未逐条确认：可以用但要提醒，不阻止推进。 */
  unverifiedClaimIds: string[];
  /** 不可引用：模型抽取、系统推断、冲突或已撤回。 */
  blockedClaimIds: string[];
  /**
   * 被拦下的事实本身。只用于服务端校验和向用户解释「为什么不能用」，
   * 不进入模型 Prompt，避免模型把抽取内容当经历。
   */
  blockedClaimDetails: CareerClaim[];
  conflicts: Array<{ entityKey: string; claimIds: string[] }>;
  budget: ContextBudget;
  /** 回答「我上传过怎么没看到」。 */
  selection: {
    included: ContextSelectionEntry[];
    excluded: ContextExclusionEntry[];
  };
  usage: {
    usedTokens: number;
    truncated: boolean;
  };
  compiledAt: string;
  fingerprint: string;
}

/**
 * 渲染后的一块 prompt 内容。text 是按 refId 从 bundle 取回的原文，
 * 不是重新过滤的结果。
 */
export interface PromptSection {
  kind: ContextItemKind;
  refId: string;
  trustType: TrustType;
  rule: SelectionRule;
  priority: number;
  text: string;
  estimatedTokens: number;
}

export interface PromptRenderResult {
  /** 可直接拼进 user message 的文本。 */
  text: string;
  sections: PromptSection[];
  usedTokens: number;
  truncated: boolean;
  /** 完整性问题（原文缺失）与预算溢出提示。route 应该把它回传给用户。 */
  warnings: string[];
}

export interface ArtifactSectionDraft {
  path: string;
  content: string;
  claimIds: string[];
}

export interface ArtifactDraft {
  artifactType: string;
  visibility?: ClaimVisibility;
  sections: ArtifactSectionDraft[];
}

export interface ConsistencyIssue {
  code:
    | "unknown_claim"
    | "unconfirmed_claim"
    | "unverified_source_claim"
    | "unsupported_source"
    | "conflicted_claim"
    | "withdrawn_claim"
    | "unsupported_number"
    | "empty_provenance"
    | "private_claim_exposure";
  severity: "error" | "warning";
  path: string;
  message: string;
  claimIds?: string[];
  token?: string;
}

export interface ConsistencyReport {
  ok: boolean;
  issues: ConsistencyIssue[];
  referencedClaimIds: string[];
  checkedAt: string;
}

/**
 * PRD §4.2：状态统一为 reading / ready / running / waiting_user / saving /
 * completed / failed / cancelled。生成完但未持久化只显示「正在保存」。
 */
export type CoachRunStatus =
  | "reading"
  | "ready"
  | "running"
  | "waiting_user"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

/** 明确停止状态。PRD §5.6：超时、费用上限、权限不足、用户取消、无法举证都有停止状态。 */
export type CoachStopReason =
  | "completed"
  | "awaiting_user"
  | "timeout"
  | "cost_cap"
  | "permission_denied"
  | "user_cancelled"
  | "no_evidence"
  | "error";

export interface CoachRun {
  id: string;
  userId: string;
  opportunityId: string | null;
  actionType: CoachActionType;
  executor: CoachExecutor;
  status: CoachRunStatus;
  goal: string;
  input: Record<string, unknown>;
  contextSnapshot?: ContextBundle;
  output?: unknown;
  requiresConfirmation: boolean;
  contextVersion: number;
  promptVersion: string | null;
  intent: string | null;
  planVersion: number | null;
  selectedOpportunityIds: string[];
  budget: ContextBudget;
  stoppedReason: CoachStopReason | null;
  modelCallCount: number;
  toolCallCount: number;
}
