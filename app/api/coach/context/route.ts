import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { renderContextForPrompt } from "@/lib/coach-harness";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import type { ContextAttachment } from "@/lib/coach-harness";
import type { CoachActionType, ContextItemKind } from "@/lib/coach-harness";

export const runtime = "nodejs";
const tasks = new Set<CoachActionType>(["job_decision", "resume_workshop", "project_deep_dive", "mock_interview", "interview_review", "follow_up", "application_assist"]);

/**
 * GET：简单查询。无 attachments（GET 不适合传长材料）。
 *
 * query:
 *   task            必填，CoachActionType
 *   opportunity_id  可选
 *   intent / plan_version / deadline  可选，进入编译
 *   render=1        可选，附带渲染后的 prompt section 列表（仅元信息）
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  const url = new URL(request.url);
  const task = url.searchParams.get("task") as CoachActionType;
  if (!tasks.has(task)) return NextResponse.json({ ok: false, error: "无效任务" }, { status: 400 });
  try {
    const context = await getContextBundleForUser({
      userId: user.id,
      task,
      opportunityId: url.searchParams.get("opportunity_id"),
      intent: url.searchParams.get("intent"),
      planVersion: url.searchParams.get("plan_version") ? Number(url.searchParams.get("plan_version")) : null,
      deadline: url.searchParams.get("deadline"),
    });
    const render = url.searchParams.get("render") === "1";
    const excludeKinds = parseExcludeKinds(url.searchParams.get("exclude_kinds"));
    return NextResponse.json({
      ok: true,
      context,
      ...(render ? renderBundle(context, { excludeKinds }) : {}),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "上下文生成失败" }, { status: 500 });
  }
}

/**
 * POST：复杂查询，可携带 attachments / currentInput / questionSource 等。
 * 用于单题练习、岗位冻结这类「需要把外部材料纳入 ContextBundle」的场景。
 *
 * body:
 *   task                 必填
 *   opportunityId        可选
 *   intent / planVersion / deadline  可选
 *   questionSource       { id, text, version? } | null
 *   currentInput         string | null
 *   attachments          Array<{ id, label, text, required? }>
 *   budget               { maxInputTokens, maxModelCalls, maxToolCalls } | null
 *   render               boolean，默认 false
 *   excludeKinds         ContextItemKind[]
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }
  const task = body.task as CoachActionType;
  if (!tasks.has(task)) return NextResponse.json({ ok: false, error: "无效任务" }, { status: 400 });
  const opportunityId = body.opportunityId ? String(body.opportunityId).trim() : undefined;
  const questionSource = body.questionSource && typeof body.questionSource === "object"
    ? { id: String((body.questionSource as Record<string, unknown>).id || "context-question-source"), text: String((body.questionSource as Record<string, unknown>).text || ""), version: (body.questionSource as Record<string, unknown>).version ? String((body.questionSource as Record<string, unknown>).version) : null }
    : null;
  const currentInput = body.currentInput ? String(body.currentInput) : null;
  const attachments: ContextAttachment[] | undefined = Array.isArray(body.attachments)
    ? (body.attachments as Array<Record<string, unknown>>).slice(0, 8).map((item, index) => ({
      id: String(item.id || `attachment-${index + 1}`),
      label: String(item.label || `附件 ${index + 1}`).slice(0, 60),
      text: String(item.text || ""),
      required: Boolean(item.required),
    })).filter((item) => item.text.trim())
    : undefined;
  const budget = body.budget && typeof body.budget === "object"
    ? body.budget as { maxInputTokens?: number; maxModelCalls?: number; maxToolCalls?: number }
    : undefined;
  const planVersion = body.planVersion ? Number(body.planVersion) : null;
  const intent = body.intent ? String(body.intent) : null;
  const deadline = body.deadline ? String(body.deadline) : null;

  try {
    const context = await getContextBundleForUser({
      userId: user.id,
      task,
      opportunityId,
      questionSource: questionSource?.text ? questionSource : null,
      currentInput,
      attachments,
      budget,
      planVersion,
      intent,
      deadline,
    });
    const render = Boolean(body.render);
    const excludeKinds = parseExcludeKinds(body.excludeKinds);
    return NextResponse.json({
      ok: true,
      context,
      ...(render ? renderBundle(context, { excludeKinds }) : {}),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "上下文生成失败" }, { status: 500 });
  }
}

function parseExcludeKinds(value: unknown): ContextItemKind[] | undefined {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : String(value).split(",");
  const allowed = new Set<ContextItemKind>(["current_input", "question_source", "attachment", "opportunity", "artifact", "confirmed_fact", "recent_practice", "knowledge", "history_summary"]);
  const filtered = list.map((item) => String(item).trim()).filter((item): item is ContextItemKind => allowed.has(item as ContextItemKind));
  return filtered.length ? filtered : undefined;
}

function renderBundle(context: Awaited<ReturnType<typeof getContextBundleForUser>>, options: { excludeKinds?: ContextItemKind[] }) {
  const rendered = renderContextForPrompt(context, options);
  return {
    rendered: {
      text: rendered.text,
      sections: rendered.sections.map((section) => ({
        kind: section.kind, refId: section.refId, trustType: section.trustType,
        rule: section.rule, priority: section.priority, estimatedTokens: section.estimatedTokens,
        textLength: section.text.length,
      })),
      usedTokens: rendered.usedTokens,
      truncated: rendered.truncated,
      warnings: rendered.warnings,
    },
  };
}