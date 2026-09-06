import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { assertContextFits, renderContextForPrompt } from "@/lib/coach-harness/prompt";
import { getContextBundleForUser } from "@/lib/coach-harness/repository";
import { getDbClient } from "@/lib/db";
import { requireDb } from "@/lib/coach-harness/repository";

export const runtime = "nodejs";

/**
 * 多岗位比较（PRD §3.1 准备投递行 / §5.1 跨岗位比较）。
 *
 * 只比较用户明确选中的岗位（selected_opportunity_ids），背景不串用。
 * 生成比较分析但不产出「匹配分」——PRD §4.1：准备阶段不显示虚假的岗位匹配分。
 * 每个岗位的 JD 作为独立 attachment 进入预算，被舍弃时能定位是哪一个。
 */

const COMPARE_BUDGET = { maxInputTokens: 12_000 };

interface CompareRow {
  id: string;
  company: string;
  role: string;
  stage: string;
  hasJd: boolean;
  jdChars: number;
  nextEvent: string | null;
  evidenceCoverage: { strong: number; weak: number; missing: number; unverified: number } | null;
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let body: { opportunityIds?: unknown; question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body?.opportunityIds)
    ? (body.opportunityIds as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  if (ids.length < 2 || ids.length > 4) {
    return NextResponse.json({ ok: false, error: "请选择 2-4 个岗位进行比较" }, { status: 400 });
  }
  const focusQuestion = typeof body.question === "string" && body.question.trim() ? body.question.trim() : "";

  try {
    const db = requireDb(await getDbClient());
    const rows: Array<Record<string, unknown>> = [];
    for (const id of ids) {
      const { data, error } = await db.from("coach_opportunities")
        .select("id, company, role, stage, jd_text, scheduled_interview_at, metadata")
        .eq("id", id).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ ok: false, error: `岗位不存在或无权访问：${id}` }, { status: 404 });
      rows.push(data);
    }

    // 确定性对比表：只摆事实，不打分（PRD §4.1 不做神秘总分）
    const table: CompareRow[] = rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      const coverage = metadata.evidenceCoverage as Record<string, unknown> | undefined;
      const jdText = typeof row.jd_text === "string" ? row.jd_text : "";
      return {
        id: String(row.id),
        company: String(row.company),
        role: String(row.role),
        stage: String(row.stage),
        hasJd: Boolean(jdText.trim()),
        jdChars: jdText.length,
        nextEvent: row.scheduled_interview_at ? String(row.scheduled_interview_at) : null,
        evidenceCoverage: coverage && typeof coverage === "object"
          ? {
              strong: Number(coverage.strong ?? 0),
              weak: Number(coverage.weak ?? 0),
              missing: Number(coverage.missing ?? 0),
              unverified: Number(coverage.unverified ?? 0),
            }
          : null,
      };
    });

    // 每个岗位的 JD 独立 attachment：被预算舍弃时 excluded 能精确定位是哪一份
    const attachments = rows
      .filter((row) => typeof row.jd_text === "string" && String(row.jd_text).trim())
      .map((row) => ({
        id: `jd-${row.id}`,
        label: `JD：${row.company} · ${row.role}`,
        text: String(row.jd_text),
        required: false, // 没有 JD 的岗位也参与比较（按表格维度），不因缺 JD 阻塞
      }));

    const context = await getContextBundleForUser({
      userId: user.id,
      task: "job_decision",
      opportunityId: table[0].id,
      intent: `比较 ${table.length} 个选中岗位，帮助用户做投递取舍`,
      selectedOpportunityIds: ids,
      attachments,
      budget: COMPARE_BUDGET,
    });
    assertContextFits(context);
    const rendered = renderContextForPrompt(context, {
      excludeKinds: ["attachment"], // JD 有自己的抬头段落
    });

    const jdBlock = table
      .map((row, index) => `【岗位 ${index + 1}：${row.company} · ${row.role}】（阶段：${row.stage}${row.hasJd ? "" : "，暂无 JD"}）\n${rows[index].jd_text ? String(rows[index].jd_text) : "（未提供 JD，只按已知信息比较）"}`)
      .join("\n\n---\n\n");

    const systemPrompt = `你是求职决策助手。用户明确选中了 ${table.length} 个岗位来比较。任务：输出每个岗位的要求要点、与用户已有证据的匹配点、主要风险，以及一句「下一步最该补什么」。

硬规则：
- 只比较选中的岗位，不引入别的岗位。
- 不产出任何数字形式的「匹配分」「成功率」。
- 缺 JD 的岗位明确说「该岗位信息不足，无法比较要求」，不猜测。
- 只输出严格 JSON：{"comparison": Array<{company: string, requirements: string[], matches: string[], risks: string[], nextStep: string}>}`;

    const userPrompt = `【确定性对比表（系统生成，事实为准）】
${JSON.stringify(table, null, 2)}

${focusQuestion ? `【用户本次比较最关心的问题】\n${focusQuestion}\n\n` : ""}【各岗位 JD 原文】
${jdBlock}

${rendered.text ? `【相关背景（可引用，注明来源）】\n${rendered.text}` : ""}

请输出比较分析，严格 JSON。`;

    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, maxTokens: 1600, timeoutMs: 60_000, maxRetries: 1 },
    );

    let parsed: { comparison?: unknown };
    try {
      const cleaned = String(response).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ ok: false, error: "模型返回不是有效 JSON，请重试" }, { status: 502 });
    }
    const comparison = Array.isArray(parsed.comparison) ? parsed.comparison : [];
    if (!comparison.length) {
      return NextResponse.json({ ok: false, error: "模型未返回比较结果，请重试" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      table,
      comparison,
      contextSummary: {
        usedTokens: context.usage.usedTokens,
        truncated: context.usage.truncated,
        excluded: context.selection.excluded.map((e) => ({ kind: e.kind, refId: e.refId, rule: e.rule })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "比较失败" },
      { status: 500 },
    );
  }
}
