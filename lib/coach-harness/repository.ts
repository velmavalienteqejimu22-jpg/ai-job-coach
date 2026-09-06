import { getDbClient } from "@/lib/db";
import { createHash } from "node:crypto";
import { compileContextBundle } from "./context";
import { assertRunTransition, isTerminalRunStatus, isValidStopReason, normalizeRunStatus } from "./state-machine";
import type { CoachRunStatus, CoachStopReason } from "./types";
import type {
  ArtifactReference,
  ArtifactReviewStatus,
  ArtifactReviewType,
  CareerClaim,
  CoachActionType,
  CoachExecutor,
  ContextAttachment,
  ContextBudget,
  ContextBundle,
  OpportunityContext,
  OpportunitySnapshotType,
  RouteClass,
  SourceKind,
  VerificationLevel,
} from "./types";
import type { Opportunity } from "@/lib/opportunities/types";
import { buildAgentKnowledgeContext, type AgentKnowledgeTask } from "@/lib/knowledge/context";

export function requireDb(db: Awaited<ReturnType<typeof getDbClient>>) {
  if (!db) throw new Error("数据库不可用");
  return db;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PRD §6.2：禁止从模型参数或请求正文信任 user_id。
 * 关联对象也要带 owner 约束，避免「对象属于自己、关联对象属于别人」。
 */
export function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`${label} 无效`);
  return value;
}

type DbRow = Record<string, unknown>;

function contentHash(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

async function recordSource(input: {
  userId: string; opportunityId?: string | null; sourceType: "resume" | "user_answer" | "project_note" | "mock_interview" | "real_interview" | "application" | "jd" | "other";
  title: string; content: string; metadata?: Record<string, unknown>;
}) {
  const db = requireDb(await getDbClient());
  const hash = contentHash(input.content);
  const { data: existing, error: lookupError } = await db.from("coach_sources")
    .select("id").eq("user_id", input.userId).eq("content_hash", hash).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { id: String(existing.id), hash };
  const { data, error } = await db.from("coach_sources").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, source_type: input.sourceType,
    title: input.title, content: input.content, content_hash: hash, metadata: input.metadata || {},
  }).select("id").single();
  if (error) throw error;
  return { id: String(data.id), hash };
}

async function recordResumeClaims(input: {
  userId: string;
  opportunityId: string;
  sourceId: string;
  content: string;
  global: boolean;
}) {
  const db = requireDb(await getDbClient());
  if (!input.global) {
    const globalClaims = await db.from("coach_claims").select("entity_key")
      .eq("user_id", input.userId).eq("source_id", input.sourceId).is("opportunity_id", null).limit(1);
    if (globalClaims.error) throw globalClaims.error;
    if (globalClaims.data?.length) return;
  }
  let lookup = db.from("coach_claims").select("entity_key")
    .eq("user_id", input.userId).eq("source_id", input.sourceId);
  lookup = input.global ? lookup.is("opportunity_id", null) : lookup.eq("opportunity_id", input.opportunityId);
  const existing = await lookup;
  if (existing.error) throw existing.error;
  const existingKeys = new Set((existing.data || []).map((claim: { entity_key: unknown }) => String(claim.entity_key)));
  const rows = input.content.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 120).map((line) => ({
    user_id: input.userId,
    opportunity_id: input.global ? null : input.opportunityId,
    source_id: input.sourceId,
    entity_type: "experience",
    entity_key: `resume-${contentHash(line).slice(0, 20)}`,
    claim_type: "resume_source",
    value: line,
    display_text: line,
    source_excerpt: line,
    status: "confirmed",
    visibility: "recruiter_safe",
    confirmed_at: new Date().toISOString(),
  })).filter((row) => !existingKeys.has(row.entity_key));
  if (rows.length) {
    const { error } = await db.from("coach_claims").insert(rows);
    if (error) throw error;
  }
}

export async function createOpportunitySnapshot(input: {
  userId: string; opportunityId: string; snapshotType: OpportunitySnapshotType; title: string;
  content: unknown; sourceId?: string | null; artifactId?: string | null;
  createdBy?: "user" | "hosted_ai" | "personal_agent" | "system"; metadata?: Record<string, unknown>;
}) {
  const db = requireDb(await getDbClient());
  const hash = contentHash(input.content);
  const { data: existing, error: existingError } = await db.from("coach_opportunity_snapshots")
    .select("*").eq("user_id", input.userId).eq("opportunity_id", input.opportunityId)
    .eq("snapshot_type", input.snapshotType).eq("content_hash", hash).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { data: latest, error: latestError } = await db.from("coach_opportunity_snapshots")
    .select("version").eq("user_id", input.userId).eq("opportunity_id", input.opportunityId)
    .eq("snapshot_type", input.snapshotType).order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  const { data, error } = await db.from("coach_opportunity_snapshots").insert({
    user_id: input.userId, opportunity_id: input.opportunityId, snapshot_type: input.snapshotType,
    version: Number(latest?.version || 0) + 1, title: input.title, content: input.content,
    content_hash: hash, source_id: input.sourceId || null, artifact_id: input.artifactId || null,
    created_by: input.createdBy || "user", metadata: input.metadata || {},
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function createArtifactWithClaims(input: {
  userId: string; opportunityId: string; artifactType: "master_resume" | "target_resume" | "interview_plan" | "mock_interview" | "interview_review" | "application_answer" | "project_story" | "other";
  title: string; content: unknown; status?: "draft" | "needs_confirmation" | "confirmed" | "archived";
  contextSnapshot?: unknown; createdBy?: "user" | "hosted_ai" | "personal_agent" | "system";
  claimLinks?: Array<{ claimId: string; usagePath: string }>;
}) {
  const db = requireDb(await getDbClient());
  const { data: latest, error: latestError } = await db.from("coach_artifacts").select("id, version")
    .eq("user_id", input.userId).eq("opportunity_id", input.opportunityId).eq("artifact_type", input.artifactType)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  const { data, error } = await db.from("coach_artifacts").insert({
    user_id: input.userId, opportunity_id: input.opportunityId, artifact_type: input.artifactType,
    parent_id: latest?.id || null, version: Number(latest?.version || 0) + 1, title: input.title,
    content: input.content, status: input.status || "draft", context_snapshot: input.contextSnapshot || {},
    created_by: input.createdBy || "hosted_ai",
  }).select("*").single();
  if (error) throw error;
  const links = (input.claimLinks || []).filter((link) => link.claimId);
  if (links.length) {
    const { error: linkError } = await db.from("coach_artifact_claims").insert(links.map((link) => ({
      artifact_id: data.id, claim_id: link.claimId, usage_path: link.usagePath,
    })));
    if (linkError) throw linkError;
  }
  return data;
}

export async function recordArtifactReview(input: {
  userId: string; opportunityId: string; artifactId: string; reviewerType: ArtifactReviewType;
  status: ArtifactReviewStatus; summary: string; findings?: unknown[]; contextFingerprint?: string | null;
}) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_artifact_reviews").upsert({
    user_id: input.userId, opportunity_id: input.opportunityId, artifact_id: input.artifactId,
    reviewer_type: input.reviewerType, status: input.status, summary: input.summary,
    findings: input.findings || [], context_fingerprint: input.contextFingerprint || null,
  }, { onConflict: "artifact_id,reviewer_type" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function listArtifactReviews(userId: string, opportunityId: string, artifactId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_artifact_reviews").select("*")
    .eq("user_id", userId).eq("opportunity_id", opportunityId).eq("artifact_id", artifactId);
  if (error) throw error;
  return data || [];
}

export async function getArtifactForUser(userId: string, opportunityId: string, artifactId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_artifacts").select("*")
    .eq("user_id", userId).eq("opportunity_id", opportunityId).eq("id", artifactId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("简历版本不存在");
  return data;
}

function knowledgeTask(task: CoachActionType): AgentKnowledgeTask {
  if (task === "job_decision" || task === "application_assist") return "job_analysis";
  if (task === "resume_workshop") return "resume_tailoring";
  if (task === "mock_interview") return "mock_interview";
  if (task === "interview_review") return "interview_review";
  return "career_coaching";
}

function mapClaim(row: DbRow): CareerClaim {
  const sourceKind = (row.source_kind ? String(row.source_kind) : "migrated_legacy") as SourceKind;
  const verificationLevel = (row.verification_level ? String(row.verification_level) : "self_reported") as VerificationLevel;
  return {
    id: String(row.id),
    entityType: row.entity_type as CareerClaim["entityType"],
    entityKey: String(row.entity_key),
    claimType: String(row.claim_type),
    value: row.value,
    displayText: String(row.display_text),
    sourceExcerpt: row.source_excerpt ? String(row.source_excerpt) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    status: row.status as CareerClaim["status"],
    visibility: row.visibility as CareerClaim["visibility"],
    sourceKind,
    verificationLevel,
    migratedFrom: row.migrated_from ? String(row.migrated_from) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

const CLAIM_COLUMNS = "id, source_id, opportunity_id, entity_type, entity_key, claim_type, value, display_text, source_excerpt, status, visibility, source_kind, verification_level, migrated_from, updated_at";

/**
 * 作用域优先：先在数据库里按「用户 + 岗位作用域」筛掉无关行，再排序。
 * 旧实现先取最近 500 条 claims / 50 条 artifacts 再在内存里过滤，
 * 结果旧岗位的相关证据可能在查询阶段就被新数据挤掉了。
 */
function scopeToUserAndOpportunity<T>(
  query: T,
  opportunityId: string | null | undefined,
  apply: (q: T, expression: string) => T,
  applyIsNull: (q: T) => T,
): T {
  return opportunityId
    ? apply(query, `opportunity_id.is.null,opportunity_id.eq.${assertUuid(opportunityId, "opportunityId")}`)
    : applyIsNull(query);
}

export async function getContextBundleForUser(input: {
  userId: string;
  task: CoachActionType;
  opportunityId?: string | null;
  intent?: string | null;
  planVersion?: number | null;
  selectedOpportunityIds?: string[];
  deadline?: string | null;
  userOverride?: boolean;
  currentInput?: string | null;
  questionSource?: { id: string; text: string; version?: string | null } | null;
  historySummary?: { id: string; text: string } | null;
  attachments?: ContextAttachment[];
  routeClass?: RouteClass;
  budget?: Partial<ContextBudget>;
  knowledgeLimit?: number;
}): Promise<ContextBundle> {
  const db = requireDb(await getDbClient());
  let opportunity: OpportunityContext | null = null;

  if (input.opportunityId) {
    const { data, error } = await db.from("coach_opportunities")
      .select("id, company, role, stage, jd_text, jd_version, scheduled_interview_at")
      .eq("id", input.opportunityId).eq("user_id", input.userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("岗位不存在");
    opportunity = {
      id: String(data.id), company: String(data.company), role: String(data.role), stage: String(data.stage),
      jdText: data.jd_text ? String(data.jd_text) : null, jdVersion: Number(data.jd_version),
      scheduledInterviewAt: data.scheduled_interview_at ? String(data.scheduled_interview_at) : null,
    };
  }

  const routeClass: RouteClass = input.routeClass || "bounded_orchestration";

  let claimQuery = db.from("coach_claims").select(CLAIM_COLUMNS).eq("user_id", input.userId);
  claimQuery = scopeToUserAndOpportunity(
    claimQuery, opportunity?.id ?? null,
    (q, expression) => q.or(expression),
    (q) => q.is("opportunity_id", null),
  );
  const { data: claimRows, error: claimError } = await claimQuery
    .order("updated_at", { ascending: false }).limit(300);
  if (claimError) throw claimError;

  let artifactQuery = db.from("coach_artifacts")
    .select("id, opportunity_id, artifact_type, version, title, status, content, created_by, created_at")
    .eq("user_id", input.userId);
  artifactQuery = scopeToUserAndOpportunity(
    artifactQuery, opportunity?.id ?? null,
    (q, expression) => q.or(expression),
    (q) => q.is("opportunity_id", null),
  );
  const { data: artifactRows, error: artifactError } = await artifactQuery
    .order("created_at", { ascending: false }).limit(100);
  if (artifactError) throw artifactError;
  const relevantArtifacts = (artifactRows || []) as DbRow[];

  let claimLinks: Record<string, string[]> = {};
  if (relevantArtifacts.length) {
    const { data: linkRows, error: linkError } = await db.from("coach_artifact_claims")
      .select("artifact_id, claim_id").in("artifact_id", relevantArtifacts.map((row) => row.id));
    if (linkError) throw linkError;
    claimLinks = ((linkRows || []) as DbRow[]).reduce((acc: Record<string, string[]>, row) => {
      const artifactId = String(row.artifact_id);
      acc[artifactId] = [...(acc[artifactId] || []), String(row.claim_id)];
      return acc;
    }, {});
  }

  const artifacts: ArtifactReference[] = relevantArtifacts.map((row) => ({
    id: String(row.id), artifactType: String(row.artifact_type), version: Number(row.version), title: String(row.title),
    status: String(row.status), content: row.content, claimIds: claimLinks[String(row.id)] || [],
    createdAt: String(row.created_at),
    createdBy: (["user", "hosted_ai", "personal_agent", "system"].includes(String(row.created_by))
      ? String(row.created_by)
      : "hosted_ai") as NonNullable<ArtifactReference["createdBy"]>,
  }));

  // PRD §5.6：知识片段默认 0 条，需要时才取最相关的少量完整片段。
  // 直接执行不检索；单次推理最多 1–2 个完整片段；有界编排才放宽到 6。
  const knowledgeLimit = input.knowledgeLimit
    ?? (routeClass === "direct" ? 0 : routeClass === "single_inference" ? 2 : 6);
  const knowledge = knowledgeLimit > 0
    ? await buildAgentKnowledgeContext({
        task: knowledgeTask(input.task),
        company: opportunity?.company,
        role: opportunity?.role,
        query: [opportunity?.company, opportunity?.role, opportunity?.jdText?.slice(0, 180), input.task].filter(Boolean).join(" "),
        limit: knowledgeLimit,
      })
    : { items: [], contextText: "" };

  return compileContextBundle({
    task: input.task,
    userId: input.userId,
    opportunity,
    claims: ((claimRows || []) as DbRow[]).map(mapClaim),
    artifacts,
    knowledge: knowledge.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      goal: item.goal,
      scope: item.scope,
      confidence: item.confidence,
      evidenceUrls: item.evidence.map((source) => source.url),
    })),
    knowledgeContext: knowledge.contextText,
    currentInput: input.currentInput,
    questionSource: input.questionSource,
    attachments: input.attachments,
    historySummary: input.historySummary,
    intent: input.intent,
    planVersion: input.planVersion,
    selectedOpportunityIds: input.selectedOpportunityIds,
    deadline: input.deadline,
    userOverride: input.userOverride,
    routeClass,
    budget: input.budget,
  });
}

export async function listClaims(userId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").select("*").eq("user_id", userId)
    .neq("status", "withdrawn").order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(mapClaim);
}

export async function createClaim(input: {
  userId: string; opportunityId?: string | null; sourceId?: string | null;
  entityType: CareerClaim["entityType"]; entityKey: string; claimType: string;
  value: unknown; displayText: string; sourceExcerpt?: string | null;
  status?: CareerClaim["status"]; visibility?: CareerClaim["visibility"];
  sourceKind?: SourceKind; verificationLevel?: VerificationLevel;
}) {
  const db = requireDb(await getDbClient());
  const status = input.status || "unverified";
  // 只有用户确认路径能把 verification_level 提到 user_confirmed；
  // 建 claim 时即使传 confirmed，也只能算自述，不能冒充逐条确认。
  const verificationLevel: VerificationLevel =
    input.verificationLevel || (status === "confirmed" ? "user_confirmed" : "self_reported");
  const { data, error } = await db.from("coach_claims").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, source_id: input.sourceId || null,
    entity_type: input.entityType, entity_key: input.entityKey, claim_type: input.claimType,
    value: input.value, display_text: input.displayText, source_excerpt: input.sourceExcerpt || null,
    status, visibility: input.visibility || "private",
    source_kind: input.sourceKind || "user_statement",
    verification_level: verificationLevel,
    confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
  }).select("*").single();
  if (error) throw error;
  return mapClaim(data);
}

/**
 * PRD §5.2：模型只提出候选，只有用户确认才能改变确认状态。
 * 迁移继承的确认不算本次确认，因此 migrated_from 保留原值。
 */
export async function confirmClaim(userId: string, claimId: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").update({
    status: "confirmed",
    verification_level: "user_confirmed",
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", assertUuid(claimId, "claimId")).eq("user_id", userId).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("事实不存在");
  return mapClaim(data);
}

export async function withdrawClaim(userId: string, claimId: string, reason?: string) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_claims").update({
    status: "withdrawn",
    migrated_from: reason ? `withdrawn:${reason}` : "withdrawn",
    updated_at: new Date().toISOString(),
  }).eq("id", assertUuid(claimId, "claimId")).eq("user_id", userId).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("事实不存在");
  return mapClaim(data);
}

/** 事实冲突时保留两条，标记冲突，不静默选一条当成真的。 */
export async function markClaimConflicted(userId: string, claimIds: string[]) {
  const db = requireDb(await getDbClient());
  const ids = claimIds.map((id) => assertUuid(id, "claimId"));
  const { data, error } = await db.from("coach_claims").update({
    status: "conflicted", updated_at: new Date().toISOString(),
  }).in("id", ids).eq("user_id", userId).select("*");
  if (error) throw error;
  return (data || []).map(mapClaim);
}

/** PRD §5.8：把 Context 的取舍落库，回答「我上传过怎么没看到」。 */
export async function persistContextSelections(input: {
  runId: string; userId: string; context: ContextBundle;
}) {
  const db = requireDb(await getDbClient());
  const rows = [
    ...input.context.selection.included.map((entry) => ({
      run_id: input.runId, user_id: input.userId, context_version: input.context.version,
      decision: "included", kind: entry.kind, ref_id: entry.refId, ref_version: entry.refVersion || null,
      trust_type: entry.trustType, reason: entry.reason, estimated_tokens: entry.estimatedTokens,
    })),
    ...input.context.selection.excluded.map((entry) => ({
      run_id: input.runId, user_id: input.userId, context_version: input.context.version,
      decision: "excluded", kind: entry.kind, ref_id: entry.refId, ref_version: null,
      trust_type: null, reason: entry.reason, detail: entry.detail, estimated_tokens: 0,
    })),
  ];
  if (!rows.length) return;
  const { error } = await db.from("coach_run_context_selections").insert(rows);
  if (error) throw error;
}

export async function createCoachRun(input: {
  userId: string; opportunityId?: string | null; task: CoachActionType; executor: CoachExecutor;
  goal: string; payload?: Record<string, unknown>; context: ContextBundle; requiresConfirmation?: boolean;
  promptVersion?: string | null;
}) {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_runs").insert({
    user_id: input.userId, opportunity_id: input.opportunityId || null, action_type: input.task,
    executor: input.executor, goal: input.goal, input: input.payload || {}, context_snapshot: input.context,
    requires_confirmation: Boolean(input.requiresConfirmation),
    // PRD §5.3 / §5.8：每次运行记录 Context、Prompt 版本、意图、计划和预算。
    context_version: input.context.version,
    prompt_version: input.promptVersion || null,
    intent: input.context.intent,
    plan_version: input.context.planVersion,
    selected_opportunity_ids: input.context.selectedOpportunityIds,
    deadlines: input.context.deadline ? { primary: input.context.deadline } : {},
    budget: input.context.budget,
    status: "reading",
  }).select("*").single();
  if (error) throw error;
  await db.from("coach_run_events").insert({
    user_id: input.userId, run_id: data.id, event_type: "created",
    payload: { fingerprint: input.context.fingerprint, budget: input.context.budget },
  });
  try {
    await persistContextSelections({ runId: String(data.id), userId: input.userId, context: input.context });
    await db.from("coach_run_events").insert({
      user_id: input.userId, run_id: data.id, event_type: "context_compiled",
      payload: {
        included: input.context.selection.included.length,
        excluded: input.context.selection.excluded.length,
        usedTokens: input.context.usage.usedTokens,
        truncated: input.context.usage.truncated,
      },
    });
  } catch (selectionError) {
    // 取舍记录不能让任务本身失败，但要留下痕迹。
    console.error("Persist context selections failed", selectionError);
  }
  return data;
}

/**
 * 状态迁移走统一入口：非法迁移直接拒绝，终态必须带明确的停止原因。
 * PRD §4.2 / §5.6：生成完但未持久化不算完成，超时、费用上限、权限不足、
 * 用户取消、无法举证都有明确停止状态。
 */
export async function updateRunStatus(input: {
  userId: string; runId: string; to: CoachRunStatus;
  stoppedReason?: CoachStopReason | null; payload?: Record<string, unknown>;
  modelCallCount?: number; toolCallCount?: number;
}) {
  const db = requireDb(await getDbClient());
  const { data: current, error: currentError } = await db.from("coach_runs")
    .select("id, status").eq("id", assertUuid(input.runId, "runId")).eq("user_id", input.userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("运行不存在");
  const from = normalizeRunStatus(String(current.status));
  assertRunTransition(from, input.to);

  const stoppedReason = input.stoppedReason ?? null;
  if (isTerminalRunStatus(input.to) && !stoppedReason) {
    throw new Error(`运行进入终态 ${input.to} 必须给出停止原因`);
  }
  if (stoppedReason && !isValidStopReason(input.to, stoppedReason)) {
    throw new Error(`停止原因 ${stoppedReason} 与状态 ${input.to} 不匹配`);
  }

  const { data, error } = await db.from("coach_runs").update({
    status: input.to,
    stopped_reason: stoppedReason,
    model_call_count: input.modelCallCount ?? undefined,
    tool_call_count: input.toolCallCount ?? undefined,
    completed_at: isTerminalRunStatus(input.to) ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", input.runId).eq("user_id", input.userId).select("*").single();
  if (error) throw error;

  await db.from("coach_run_events").insert({
    user_id: input.userId, run_id: input.runId,
    event_type: isTerminalRunStatus(input.to) ? (input.to === "completed" ? "completed" : "stopped") : "planned",
    payload: { from, to: input.to, stoppedReason, ...(input.payload || {}) },
  });
  return data;
}

export async function listCockpitOpportunities(userId: string): Promise<Opportunity[]> {
  const db = requireDb(await getDbClient());
  const { data, error } = await db.from("coach_opportunities").select("*").eq("user_id", userId)
    .eq("status", "active").order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data || []) as DbRow[];
  const ids = rows.map((row) => String(row.id));
  const { data: snapshotRows, error: snapshotError } = ids.length
    ? await db.from("coach_opportunity_snapshots").select("id, opportunity_id, snapshot_type, version, title, frozen_at").in("opportunity_id", ids).order("version", { ascending: false })
    : { data: [], error: null };
  if (snapshotError) throw snapshotError;
  const { data: artifactRows, error: artifactError } = ids.length
    ? await db.from("coach_artifacts").select("id, opportunity_id, version").in("opportunity_id", ids).eq("artifact_type", "target_resume").order("version", { ascending: false })
    : { data: [], error: null };
  if (artifactError) throw artifactError;
  const latestArtifacts = new Map<string, DbRow>();
  for (const artifact of (artifactRows || []) as DbRow[]) if (!latestArtifacts.has(String(artifact.opportunity_id))) latestArtifacts.set(String(artifact.opportunity_id), artifact);
  const artifactIds = [...latestArtifacts.values()].map((artifact) => String(artifact.id));
  const { data: reviewRows, error: reviewError } = artifactIds.length
    ? await db.from("coach_artifact_reviews").select("artifact_id, reviewer_type, status, summary").in("artifact_id", artifactIds)
    : { data: [], error: null };
  if (reviewError) throw reviewError;
  return rows.map((row) => {
    const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Partial<Opportunity>;
    const opportunityId = String(row.id);
    const artifact = latestArtifacts.get(opportunityId);
    const reviews = ((reviewRows || []) as DbRow[]).filter((review) => String(review.artifact_id) === String(artifact?.id));
    const blocking = reviews.some((review) => review.status === "failed");
    const requiredPassed = ["facts", "ats", "independent_ai"].every((type) => reviews.some((review) => review.reviewer_type === type && review.status === "passed"));
    return {
      ...metadata,
      id: String(row.id),
      company: String(row.company),
      role: String(row.role),
      stage: String(row.stage) as Opportunity["stage"],
      jdText: row.jd_text ? String(row.jd_text) : undefined,
      location: metadata.location || "地点待确认",
      stageLabel: metadata.stageLabel || "评估中",
      priority: metadata.priority || "medium",
      sourceLabel: metadata.sourceLabel || "网页端",
      capturedAtLabel: metadata.capturedAtLabel || "已同步",
      nextEventLabel: metadata.nextEventLabel || null,
      scheduledInterviewAt: row.scheduled_interview_at ? String(row.scheduled_interview_at) : metadata.scheduledInterviewAt || null,
      recommendation: metadata.recommendation || "prepare_then_apply",
      recommendationLabel: metadata.recommendationLabel || "补充后投递",
      recommendationReason: metadata.recommendationReason || "等待补充证据。",
      evidenceCoverage: metadata.evidenceCoverage || { strong: 0, weak: 0, missing: 0, unverified: 0 },
      requirements: metadata.requirements || [],
      actions: metadata.actions || [],
      activities: metadata.activities || [],
      resumeChanges: metadata.resumeChanges || [],
      interviewFocus: metadata.interviewFocus || [],
      snapshots: ((snapshotRows || []) as DbRow[]).filter((snapshot) => String(snapshot.opportunity_id) === opportunityId).map((snapshot) => ({
        id: String(snapshot.id), snapshotType: snapshot.snapshot_type as NonNullable<Opportunity["snapshots"]>[number]["snapshotType"],
        version: Number(snapshot.version), title: String(snapshot.title), frozenAt: String(snapshot.frozen_at),
      })),
      applicationQuality: artifact ? {
        artifactId: String(artifact.id), version: Number(artifact.version), status: blocking ? "blocked" : requiredPassed ? "ready" : "draft",
        reviews: reviews.map((review) => ({ reviewerType: review.reviewer_type as NonNullable<Opportunity["applicationQuality"]>["reviews"][number]["reviewerType"], status: review.status as NonNullable<Opportunity["applicationQuality"]>["reviews"][number]["status"], summary: String(review.summary) })),
      } : undefined,
    };
  });
}

export async function createCockpitOpportunity(userId: string, opportunity: Omit<Opportunity, "id">) {
  const db = requireDb(await getDbClient());
  const { jdText, company, role, stage, scheduledInterviewAt, ...metadata } = opportunity;
  const { data, error } = await db.from("coach_opportunities").insert({
    user_id: userId,
    company,
    role,
    stage,
    jd_text: jdText || null,
    scheduled_interview_at: scheduledInterviewAt || null,
    metadata,
  }).select("*").single();
  if (error) throw error;
  const opportunityId = String(data.id);

  const sources = [
    jdText ? { type: "jd", title: `${company} · ${role} JD`, content: jdText } : null,
    opportunity.resumeText ? { type: "resume", title: `${role} 使用的简历`, content: opportunity.resumeText } : null,
    opportunity.profileText && !opportunity.resumeText ? { type: "other", title: "求职准备材料", content: opportunity.profileText } : null,
  ].filter(Boolean) as Array<{ type: "jd" | "resume" | "other"; title: string; content: string }>;

  for (const source of sources) {
    const sourceRow = await recordSource({ userId, opportunityId, sourceType: source.type, title: source.title, content: source.content });

    await createOpportunitySnapshot({
      userId, opportunityId, snapshotType: source.type === "jd" ? "jd" : "base_resume",
      title: source.title, content: { text: source.content }, sourceId: sourceRow.id, createdBy: "user",
    });

    if (source.type === "resume") await recordResumeClaims({
      userId,
      opportunityId,
      sourceId: sourceRow.id,
      content: source.content,
      global: opportunity.workspaceType === "preparation",
    });
  }

  return { ...opportunity, id: opportunityId } satisfies Opportunity;
}

export async function updateCockpitOpportunity(userId: string, opportunity: Opportunity) {
  const db = requireDb(await getDbClient());
  const { id, jdText, company, role, stage, scheduledInterviewAt, ...metadata } = opportunity;
  const { data: current, error: currentError } = await db.from("coach_opportunities").select("jd_text, jd_version, metadata")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("岗位不存在");

  // 客户端有 900ms 防抖的自动同步 PATCH，可能带着尚未填充 JD/简历的岗位状态。
  // 空值不能抹掉服务器上已有的材料，否则会出现「界面展示 JD/简历快照、
  // 接口却报缺 JD 缺简历」的预览矛盾（PRD §可解释：展示与判定必须同源）。
  const incomingJd = typeof jdText === "string" ? jdText.trim() : "";
  const currentJd = current.jd_text ? String(current.jd_text) : "";
  const nextJd = incomingJd || currentJd;

  const currentMetadata = current.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {};
  const prevResume = typeof currentMetadata.resumeText === "string" ? currentMetadata.resumeText : "";
  const incomingResume = typeof opportunity.resumeText === "string" ? opportunity.resumeText.trim() : "";
  const nextResume = incomingResume || prevResume;
  const mergedMetadata: Record<string, unknown> = { ...metadata };
  if (nextResume) mergedMetadata.resumeText = nextResume;

  const jdChanged = Boolean(nextJd && nextJd !== current.jd_text);
  const resumeChanged = Boolean(nextResume && nextResume !== prevResume);
  const { error } = await db.from("coach_opportunities").update({
    company, role, stage, jd_text: nextJd || null, scheduled_interview_at: scheduledInterviewAt || null,
    jd_version: jdChanged ? Number(current.jd_version) + 1 : Number(current.jd_version), metadata: mergedMetadata, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
  if (jdChanged && nextJd) {
    const source = await recordSource({ userId, opportunityId: id, sourceType: "jd", title: `${company} · ${role} JD`, content: nextJd });
    await createOpportunitySnapshot({ userId, opportunityId: id, snapshotType: "jd", title: `${company} · ${role} JD`, content: { text: nextJd }, sourceId: source.id, createdBy: "user" });
  }
  if (resumeChanged && nextResume) {
    const source = await recordSource({ userId, opportunityId: id, sourceType: "resume", title: `${role} 使用的简历`, content: nextResume });
    await createOpportunitySnapshot({ userId, opportunityId: id, snapshotType: "base_resume", title: `${role} 使用的简历`, content: { text: nextResume }, sourceId: source.id, createdBy: "user" });
    await recordResumeClaims({ userId, opportunityId: id, sourceId: source.id, content: nextResume, global: opportunity.workspaceType === "preparation" });
  }
}
