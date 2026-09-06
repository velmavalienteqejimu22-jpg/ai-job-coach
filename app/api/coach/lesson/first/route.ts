import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  createStandaloneArtifact,
  getCurrentPlan,
  getPlanById,
  updatePlanTasks,
  type PlanTask,
} from "@/lib/coach-harness/plans";

export const runtime = "nodejs";

/**
 * 第一课：拆解一个 AI 产品问题（PRD §0 / 验收 18）。
 *
 * 无任何材料即可开始。案例 + 短讲解 + 3 道判断题（确定性判定，不假装 AI 评分）
 * + 1 句开放答案（如实保存，不假装判定）。提交后留下产物、把计划任务标记完成、
 * 给出下一步——这是「从零学」入口的首个真实成果。
 */

const LESSON = {
  id: "lesson-001-decompose-ai-problem",
  title: "第一课：拆解一个 AI 产品问题",
  version: 1,
  case_: "一个 AI 笔记应用，「智能摘要」功能的采用率只有 15%，产品经理想提升它。",
  teaching: [
    "先弄清数字背后的事实：15% 是谁在用、和什么比是低？没有基线和口径的数字不能直接指导动作。",
    "把「用得少」拆成漏斗：知道这个功能 → 打开试过 → 用成功 → 下次还用。每个环节的流失原因和对策完全不同。",
    "找到最大的瓶颈再动手，不平均用力；一次只改一个变量，否则提升了你也不知道归因给谁。",
  ],
  questions: [
    {
      id: "q1",
      prompt: "「15% 低于同行水平，所以要先马上改界面」——这个判断有什么问题？",
      options: [
        "没问题，低于同行就该尽快动手改",
        "有问题：「低于同行」没有给出比较对象和口径，改界面也只是猜的对策", // correct
      ],
      correctIndex: 1,
      explanation: "没有基线和口径的数字不能直接指导动作。先问「和谁比、怎么算的、哪类用户里是 15%」。",
    },
    {
      id: "q2",
      prompt: "下一步最有信息量的动作是什么？",
      options: [
        "先看「知道的人里多少试过、试过的人里多少留下」，把漏斗各环节的流失拆开", // correct
        "直接上线 A/B 测试五个新版本，看哪个数据好",
      ],
      correctIndex: 0,
      explanation: "先分解再动手。漏斗拆开后才知道瓶颈在认知、尝试还是留存，动作完全不同。",
    },
    {
      id: "q3",
      prompt: "为了快速见效，同时改引导、摘要质量和入口文案——这个做法的问题是什么？",
      options: [
        "没问题，多管齐下速度快",
        "有问题：同时改多个变量，数据变好了也无法归因，变差了也不知道该回退哪个", // correct
      ],
      correctIndex: 1,
      explanation: "一次只改一个变量。先解决最大瓶颈，单变量验证后再叠加下一个改动。",
    },
  ],
  openQuestion: {
    id: "q-open",
    prompt: "用一句话写下你的下一步：针对这个案例，你会先确认什么？",
    placeholder: "例：先确认 15% 的口径——是新用户里还是全部用户里，以及和什么时期比。",
  },
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 校验绑定字段完整性：要么带全 planId+taskId+expectedVersion，要么不带（只存独立练习） */
function readBinding(body: { planId?: string; taskId?: string; expectedVersion?: number }):
  { ok: true; binding: { planId: string; taskId: string; expectedVersion: number } | null }
  | { ok: false; error: string } {
  const hasAny = body.planId !== undefined || body.taskId !== undefined || body.expectedVersion !== undefined;
  if (!hasAny) return { ok: true, binding: null };
  if (!body.planId || !UUID_RE.test(body.planId)
    || !body.taskId || !UUID_RE.test(body.taskId)
    || typeof body.expectedVersion !== "number" || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) {
    return { ok: false, error: "提交绑定不完整：需要 planId、taskId 和 expectedVersion（正整数）" };
  }
  return { ok: true, binding: { planId: body.planId, taskId: body.taskId, expectedVersion: body.expectedVersion } };
}

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  // 前端明确传入选中的 planId 就按 ID 取——跨标签时序下「当前聚焦计划」不可信
  const planIdParam = new URL(request.url).searchParams.get("planId");
  if (planIdParam && !UUID_RE.test(planIdParam)) {
    return NextResponse.json({ ok: false, error: "planId 格式无效" }, { status: 400 });
  }
  // 读取失败必须显式报错：吞成「无计划」会让提交静默降级成独立练习
  let plan: Awaited<ReturnType<typeof getPlanById>>;
  try {
    plan = planIdParam ? await getPlanById(user.id, planIdParam) : await getCurrentPlan(user.id);
  } catch {
    return NextResponse.json(
      { ok: false, error: "读取计划失败（数据库暂时不可用），请稍后重试；课程内容未加载" },
      { status: 502 },
    );
  }
  const lessonTask = plan?.tasks.find((task) => task.entryType === "learn_from_zero" && task.status !== "done") ?? null;
  return NextResponse.json({
    ok: true,
    lesson: {
      id: LESSON.id,
      title: LESSON.title,
      version: LESSON.version,
      case: LESSON.case_,
      teaching: LESSON.teaching,
      questions: LESSON.questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
      openQuestion: LESSON.openQuestion,
    },
    // 已完成过就不重复展示主卡任务，但课程本身可回访
    pendingTaskId: lessonTask?.id ?? null,
    // 提交绑定（多标签防串）：回写必须落到开课时的计划；POST 不再回退当前计划
    binding: lessonTask && plan ? { planId: plan.id, taskId: lessonTask.id, expectedVersion: plan.version } : null,
    noMaterialsRequired: true,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let body: {
    answers?: unknown;
    openAnswer?: unknown;
    planId?: string;
    taskId?: string;
    expectedVersion?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const answers = Array.isArray(body?.answers) ? body.answers : null;
  if (!answers || answers.length !== LESSON.questions.length
    || answers.some((a) => typeof a !== "number" || !Number.isInteger(a) || a < 0 || a > 1)) {
    return NextResponse.json({ ok: false, error: "answers 必须是每题的选项下标数组" }, { status: 400 });
  }
  const openAnswer = typeof body.openAnswer === "string" ? body.openAnswer.trim() : "";
  if (!openAnswer) {
    return NextResponse.json({ ok: false, error: "开放答案不能为空——写一句你的下一步" }, { status: 400 });
  }

  // 绑定校验必须在任何写库之前：400 的请求不能已经留下数据
  const binding = readBinding(body);
  if (!binding.ok) {
    return NextResponse.json({ ok: false, error: binding.error }, { status: 400 });
  }

  // 确定性判定：选择题本地判分，不给「AI 评分」的错觉；开放句如实保存不判分。
  const results = LESSON.questions.map((question, index) => ({
    questionId: question.id,
    selected: answers[index],
    correct: answers[index] === question.correctIndex,
    explanation: question.explanation,
  }));
  const correctCount = results.filter((r) => r.correct).length;

  let artifact: Awaited<ReturnType<typeof createStandaloneArtifact>>;
  try {
  artifact = await createStandaloneArtifact({
    userId: user.id,
    title: "第一课产物：拆解 AI 产品问题练习",
    content: {
      lessonId: LESSON.id,
      lessonVersion: LESSON.version,
      mcq: results,
      mcqScore: `${correctCount}/${LESSON.questions.length}`,
      openAnswer,
      completedAt: new Date().toISOString(),
    },
    status: "confirmed", // 用户自己提交的练习结果，如实记录；不是对外宣称的能力
  });
  } catch {
    return NextResponse.json({ ok: false, error: "未能确认练习保存，请保留回答并检查历史记录后重试。", taskCompleted: false }, { status: 503 });
  }

  // 把计划任务标记完成。绑定规则（多标签防串）：
  // - 带完整 binding（planId+taskId+expectedVersion）→ 按 ID 回写开课时的计划；
  // - 不带 binding → 只保存独立练习，绝不回退「当前聚焦计划」（跨标签时序下不可信）。
  // 数据库读取失败和「计划已不存在」是两回事，分开提示，不混用。
  let taskCompleted = false;
  let taskError: string | null = null;
  let bindingWarning: string | null = null;
  if (binding.binding) {
    const { planId, taskId, expectedVersion } = binding.binding;
    let plan: Awaited<ReturnType<typeof getPlanById>> = null;
    let readFailed = false;
    try {
      plan = await getPlanById(user.id, planId);
    } catch {
      readFailed = true; // 数据库故障 ≠ 计划被删，不能混着说
    }
    if (readFailed) {
      taskError = "读取计划失败（数据库暂时不可用），任务标记未执行；练习结果已保存";
    } else if (!plan) {
      bindingWarning = "开课时的计划已不存在（可能被删除），本次仅保存独立练习";
    } else {
      const lessonTask = plan.tasks.find((task) => task.id === taskId && task.entryType === "learn_from_zero");
      if (!lessonTask) {
        bindingWarning = "该计划里没有第一课任务（可能已被修改），本次仅保存独立练习";
      } else if (lessonTask.status === "done") {
        // 已完成就不再重写——避免覆盖原产物的 artifactId 关联
        bindingWarning = "该计划的第一课任务已完成，本次仅保存独立练习，不覆盖原产物关联";
      } else {
        const tasks: PlanTask[] = plan.tasks.map((task) =>
          task.id === lessonTask.id ? { ...task, status: "done", artifactId: artifact.id } : task,
        );
        try {
          await updatePlanTasks({
            userId: user.id,
            planId: plan.id,
            tasks,
            reason: "第一课练习已提交并保存",
            expectedVersion,
          });
          taskCompleted = true;
        } catch (error) {
          // 版本冲突或更新失败：产物已保存，任务标记失败——如实告知，不假报完成
          taskError = error instanceof Error ? error.message : "任务状态更新失败";
        }
      }
    }
  } else {
    bindingWarning = "本次提交未绑定计划任务，仅保存为独立练习";
  }

  return NextResponse.json({
    ok: true,
    results,
    mcqScore: `${correctCount}/${LESSON.questions.length}`,
    // 开放答案不假装判定：如实说明已保存
    openAnswerSaved: true,
    openAnswerNote: "你的下一步已原样保存，未做对错判定——它会在后续练习里被对照使用。",
    artifactId: artifact.id,
    taskCompleted,
    taskError,
    bindingWarning,
    nextStep: "下一步建议：把这个方法用在你自己的产品/项目上——找一个真实数字，写出它的口径和漏斗。",
  });
}
