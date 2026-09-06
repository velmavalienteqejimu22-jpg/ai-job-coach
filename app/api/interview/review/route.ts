import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { runWithGenerationContext } from "@/lib/generation-context";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const interviewContent = String(body.interviewContent || "").trim().slice(0, 30_000);
    const context = String(body.context || "").trim().slice(0, 12_000);
    const followUpQuestion = String(body.followUpQuestion || "").trim().slice(0, 4_000);
    const company = String(body.company || "").trim().slice(0, 120);
    const role = String(body.role || "").trim().slice(0, 160);
    const round = String(body.round || "").trim().slice(0, 80);
    const resumeText = String(body.resumeText || "").trim().slice(0, 20_000);
    const jobDescription = String(body.jobDescription || "").trim().slice(0, 20_000);

    if (!interviewContent && !followUpQuestion) {
      return NextResponse.json(
        { ok: false, error: "缺少面试内容" },
        { status: 400 }
      );
    }

    // 追问模式
    if (followUpQuestion && context) {
      const followUpPrompt = `你是一位温柔但坦率的面试复盘教练。之前你已经对用户的面试进行了分析。

之前的分析结果：
${context}

用户的追问：${followUpQuestion}

请针对用户的追问进行深入解答。如果用户想要某个问题的参考回答，请给出具体的回答示例。语气温暖但不回避问题。`;

      const reply = await callLLM(
        [
          { role: "system", content: "你是专业的面试复盘教练，温柔但会坦率指出问题。回答简洁有针对性。" },
          { role: "user", content: followUpPrompt },
        ],
        { temperature: 0.5, maxTokens: 1500, provider: "deepseek" }
      );

      return NextResponse.json({ ok: true, reply });
    }

    // 初始分析模式
    const knowledge = await buildAgentKnowledgeContext({
      task: "interview_review",
      company,
      role,
      stage: round,
      query: [company, role, round, jobDescription.slice(0, 240), interviewContent.slice(0, 240)].filter(Boolean).join(" "),
      limit: 6,
    });

    const systemPrompt = `你是益职的面试复盘教练。用户将提供真实的面试对话记录或回忆，你需要基于当前岗位、用户简历和可追溯知识做复盘。

事实边界：
1. 面试记录没有出现的内容，不得写成用户说过或做过的事实。
2. 知识库只用于解释常见考察方向，不能当成该公司的固定题库或内部事实。
3. 无法判断时写明“记录不足”，不要推测录用概率。
4. 改进建议必须能转成下一轮可执行训练任务，不写空泛鼓励。

分析维度：
1. 面试官可能的考察意图（每个问题背后想考什么）
2. 用户回答的优点和亮点
3. 用户回答的不足和改进空间（温柔但直接地指出）
4. 每个问题的参考回答框架
5. 整体面试表现评级（S/A/B/C/D 五级）
6. 下一步改进建议

输出格式：返回JSON
{
  "overall_grade": "B+",
  "overall_comment": "整体表现中等偏上，...",
  "improvement_potential": "再练3次可达A",
  "questions": [
    {
      "interviewer_question": "面试官的问题",
      "intent": "考察意图",
      "user_answer_summary": "用户回答摘要",
      "strengths": ["亮点1", "亮点2"],
      "weaknesses": ["不足1"],
      "suggested_answer_points": ["建议回答要点1", "建议回答要点2"],
      "score": "B"
    }
  ],
  "key_strengths": ["整体优势1", "整体优势2"],
  "key_improvements": ["需改进1", "需改进2"],
  "action_items": ["具体行动1", "具体行动2"]
}

只返回JSON，不要包含markdown标记。面试内容不完整时，在 overall_comment 中明确证据边界。`;

    const userPrompt = `公司：${company || "未提供"}
岗位：${role || "未提供"}
轮次：${round || "未提供"}

岗位 JD：
${jobDescription || "未提供"}

用户简历或经历底稿：
${resumeText || "未提供"}

真实面试记录：
${interviewContent}

${knowledge.contextText}`;

    const requestId = req.headers.get("x-idempotency-key")?.trim() || crypto.randomUUID();
    const result = await runWithGenerationContext({
      userId: auth.id,
      operation: "interview_answer_review",
      requestId,
      knowledgeDocumentIds: knowledge.items.map((item) => item.id),
    }, () => callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, maxTokens: 3000, provider: "deepseek" }
    ));

    let parsed: unknown = {};
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "AI分析结果解析失败，请重试", rawResult: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      analysis: parsed,
      knowledge_document_ids: knowledge.items.map((item) => item.id),
    });
  } catch (err) {
    console.error("Interview review error:", err);
    const recovery = tokenPayRecoveryResponse(err);
    if (recovery) return recovery;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "interview_answer_review", quotaType: "interview" });
