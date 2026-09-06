"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./EntryGate.module.css";

/**
 * 四类目的入口 + 当前计划（PRD §3.1 / §4.1 / 验收 17/18/19）。
 *
 * - 首访：四个快捷入口 + 直接上传/描述提示；选择不是永久身份，可随时切换。
 * - 每类入口落在一个真实可用的交付上：
 *   从零学 → 第一课（可完成并保存产物）
 *   准备投递 → 岗位比较（不生成匹配分）
 *   准备面试 → 引导到面试页（复用现有练习）
 *   谈薪 → offer 条款录入 + 沟通草稿
 */

type GoalType = "learn_from_zero" | "prepare_apply" | "interviewing" | "negotiating";

interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "skipped";
  reason: string;
  entryType: GoalType;
  artifactId?: string;
}

interface CoachPlan {
  id: string;
  goalType: GoalType;
  version: number;
  tasks: PlanTask[];
}

interface PlanHistoryItem {
  id: string;
  goalType: GoalType;
  opportunityId: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  taskCount: number;
  doneCount: number;
  updatedAt: string;
}

interface EntriesResponse {
  ok: boolean;
  entries: Array<{ goalType: GoalType; label: string; active: boolean; available: boolean; firstOutcome: string }>;
  activePlan: CoachPlan | null;
  history?: PlanHistoryItem[];
}

interface OpportunityLite {
  id: string;
  company: string;
  role: string;
  stage: string;
  jdText?: string;
}

const ENTRY_ICONS: Record<GoalType, string> = {
  learn_from_zero: "🌱",
  prepare_apply: "📮",
  interviewing: "🎤",
  negotiating: "🤝",
};

const GOAL_LABELS: Record<GoalType, string> = {
  learn_from_zero: "从零学",
  prepare_apply: "准备投递",
  interviewing: "准备面试",
  negotiating: "谈薪",
};

const ENTRY_SUBTITLE: Record<GoalType, string> = {
  learn_from_zero: "无材料直接开课，完成一个判断练习",
  prepare_apply: "保留原版简历，先明确筛选条件再比较",
  interviewing: "不需要先上课，直接产出练习反馈",
  negotiating: "录入条款、写下取舍、生成沟通草稿",
};

export function EntryGate({ onOpenInterview, onClose }: { onOpenInterview?: () => void; onClose?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EntriesResponse["entries"]>([]);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [history, setHistory] = useState<PlanHistoryItem[]>([]);
  const [view, setView] = useState<"entries" | "plan" | "lesson" | "offers" | "compare">("entries");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * keepView=true 时只刷新列表数据（entries/history）、不动 loading/view/plan——
   * 供流程内 onSaved 回调使用。plan 不能覆盖：另一标签切换目标后，activePlan
   * 会变成别的计划，覆盖会把本页选中的 planId（FirstLesson 绑定依据）换掉，
   * 触发重新加载并清空作答。
   */
  const loadEntries = useCallback(async (opts?: { keepView?: boolean }) => {
    const keepView = opts?.keepView ?? false;
    if (!keepView) setLoading(true);
    try {
      const res = await fetch("/api/coach/entries");
      const body: EntriesResponse = await res.json();
      if (body.ok) {
        setEntries(body.entries);
        setHistory(body.history ?? []);
        if (!keepView) {
          setPlan(body.activePlan);
          setView(body.activePlan ? "plan" : "entries");
        }
      } else setMessage("计划读取失败，请稍后重新打开。");
    } catch {
      setMessage("暂时无法读取计划，请检查网络后重新打开。");
    } finally {
      if (!keepView) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadEntries(); }, [loadEntries]);

  const chooseEntry = async (goalType: GoalType, opportunityId?: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/coach/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 带岗位 ID 才能落到正确的计划——岗位隔离由后端按 opportunityId 过滤保证
        body: JSON.stringify({ goalType, opportunityId: opportunityId ?? undefined }),
      });
      const body = await res.json();
      if (!body.ok) {
        setMessage(body.error || "切换失败");
        return;
      }
      setPlan(body.plan);
      if (goalType === "learn_from_zero") setView("lesson");
      else if (goalType === "negotiating") setView("offers");
      else if (goalType === "prepare_apply") setView("compare");
      else { setView("plan"); onOpenInterview?.(); }
      await loadEntries({ keepView: true });
    } catch {
      setMessage("未收到计划切换确认，请重新打开查看当前状态。");
    } finally {
      setBusy(false);
    }
  };

  const backToEntries = () => { setView("entries"); };

  if (loading) {
    return <div className={styles.panel}><p className={styles.muted}>正在读取你的计划…</p></div>;
  }

  return (
    <div className={styles.panel}>
      {onClose && (
        <button className={styles.closeButton} aria-label="关闭" onClick={onClose}>×</button>
      )}
      {message && <p className={styles.error}>{message}</p>}

      {view === "entries" && (
        <section>
          <h2 className={styles.heading}>你现在最想推进什么？</h2>
          <p className={styles.muted}>选择只是开始，不是身份——随时可以换。</p>
          <div className={styles.entryGrid}>
            {entries.map((entry) => (
              <button
                key={entry.goalType}
                className={`${styles.entryCard} ${entry.active ? styles.entryActive : ""}`}
                disabled={busy || !entry.available}
                onClick={() => void chooseEntry(entry.goalType)}
              >
                <span className={styles.entryIcon}>{ENTRY_ICONS[entry.goalType]}</span>
                <span className={styles.entryLabel}>{entry.label}</span>
                <span className={styles.entrySub}>{ENTRY_SUBTITLE[entry.goalType]}</span>
                <span className={styles.entryOutcome}>首个成果：{entry.firstOutcome}</span>
              </button>
            ))}
          </div>
          <p className={styles.muted}>或者直接上传简历 / 粘贴 JD——有明确输入时直接行动，不再重复问。</p>
        </section>
      )}

      {view === "plan" && plan && (() => {
        const otherPlans = history.filter((h) => h.id !== plan.id && (h.status === "active" || h.status === "paused"));
        return (
          <section>
            <div className={styles.planHeader}>
              <h2 className={styles.heading}>当前计划 · v{plan.version}</h2>
              <button className={styles.ghostButton} onClick={backToEntries}>换个目标 / 查看全部</button>
            </div>
            <ul className={styles.taskList}>
              {plan.tasks.map((task) => (
                <li key={task.id} className={task.status === "done" ? styles.taskDone : styles.taskItem}>
                  <span>{task.status === "done" ? "✅" : task.status === "in_progress" ? "⏳" : "⬜"}</span>
                  <div>
                    <p className={styles.taskTitle}>{task.title}</p>
                    <p className={styles.taskDesc}>{task.description}</p>
                    <p className={styles.taskReason}>{task.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
            {otherPlans.length > 0 && (
              <div>
                <p className={styles.muted}>其他计划都在正常进行，可随时切过去（不会丢进度）：</p>
                <ul className={styles.taskList}>
                  {otherPlans.map((h) => (
                    <li key={h.id} className={styles.taskItem}>
                      <span>{h.status === "active" ? "▶" : "⏸"}</span>
                      <div>
                        <p className={styles.taskTitle}>
                          {GOAL_LABELS[h.goalType]}（{h.doneCount}/{h.taskCount}）
                        </p>
                        <button
                          className={styles.ghostButton}
                          disabled={busy}
                          onClick={() => void chooseEntry(h.goalType, h.opportunityId)}
                        >
                          切到这个计划
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })()}

      {view === "lesson" && <FirstLesson key={plan?.id ?? "independent"} planId={plan?.id ?? null} onSaved={() => void loadEntries({ keepView: true })} />}
      {view === "offers" && <OfferFlow onSaved={() => void loadEntries({ keepView: true })} />}
      {view === "compare" && <CompareFlow />}

      {view !== "entries" && (
        <button className={styles.ghostButton} onClick={backToEntries}>← 换个目标</button>
      )}
    </div>
  );
}

// ---------- 第一课（从零学） ----------

interface LessonData {
  id: string;
  title: string;
  case: string;
  teaching: string[];
  questions: Array<{ id: string; prompt: string; options: string[] }>;
  openQuestion: { id: string; prompt: string; placeholder: string };
}

interface LessonBinding {
  planId: string;
  taskId: string;
  expectedVersion: number;
}

function FirstLesson({ planId, onSaved }: { planId: string | null; onSaved: () => void }) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [openAnswer, setOpenAnswer] = useState("");
  // 开课时的绑定：提交回写到这个计划，不受其他标签页切换目标影响
  const [binding, setBinding] = useState<LessonBinding | null>(null);
  const [result, setResult] = useState<{
    mcqScore: string;
    results: Array<{ questionId: string; correct: boolean; explanation: string }>;
    artifactId: string;
    openAnswerNote: string;
    taskCompleted: boolean;
    taskError: string | null;
    bindingWarning: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
      // 明确传入选中的 planId——按 ID 取任务，避免读全局「当前聚焦计划」拿到别的标签页的计划
      const res = await fetch("/api/coach/lesson/first" + (planId ? `?planId=${planId}` : ""));
      const body = await res.json();
      if (cancelled) return;
      if (body.ok) {
        setLesson(body.lesson);
        setAnswers(new Array(body.lesson.questions.length).fill(-1));
        setBinding(body.binding ?? null);
      } else setError(body.error);
      } catch {
        if (!cancelled) setError("课程加载失败，请检查网络后重新打开。尚未提交任何回答。");
      }
    })();
    return () => { cancelled = true; };
  }, [planId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/lesson/first", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          openAnswer,
          planId: binding?.planId,
          taskId: binding?.taskId,
          expectedVersion: binding?.expectedVersion,
        }),
      });
      const body = await res.json();
      if (body.ok) { setResult(body); onSaved(); }
      else setError(body.error);
    } catch {
      setError("未收到保存确认，回答仍保留在本页。请先查看历史，避免重复提交。");
    } finally {
      setBusy(false);
    }
  };

  if (!lesson) return <p className={styles.muted}>{error || "正在加载第一课…"}</p>;

  return (
    <section>
      <h2 className={styles.heading}>{lesson.title}</h2>
      <div className={styles.caseBox}><strong>案例：</strong>{lesson.case}</div>
      <ol className={styles.teachingList}>
        {lesson.teaching.map((line, i) => <li key={i}>{line}</li>)}
      </ol>

      {lesson.questions.map((q, qi) => (
        <fieldset key={q.id} className={styles.question}>
          <legend>{q.prompt}</legend>
          {q.options.map((opt, oi) => (
            <label key={oi} className={styles.option}>
              <input
                type="radio"
                name={q.id}
                checked={answers[qi] === oi}
                onChange={() => setAnswers((cur) => cur.map((v, i) => (i === qi ? oi : v)))}
              />
              {opt}
            </label>
          ))}
          {result && (
            <p className={result.results[qi].correct ? styles.verdictOk : styles.verdictBad}>
              {result.results[qi].correct ? "正确。" : "不对。"}{result.results[qi].explanation}
            </p>
          )}
        </fieldset>
      ))}

      <fieldset className={styles.question}>
        <legend>{lesson.openQuestion.prompt}</legend>
        <textarea
          className={styles.textarea}
          placeholder={lesson.openQuestion.placeholder}
          value={openAnswer}
          onChange={(e) => setOpenAnswer(e.target.value)}
          rows={3}
        />
      </fieldset>

      {result ? (
        <div className={styles.resultBox}>
          <p>选择题得分：{result.mcqScore}</p>
          <p>{result.openAnswerNote}</p>
          <p className={styles.muted}>产物已保存（ID：{result.artifactId}），可在「我的成果」找回。</p>
          {result.taskCompleted ? (
            <p className={styles.verdictOk}>计划任务已标记完成。</p>
          ) : result.taskError ? (
            <p className={styles.verdictBad}>
              练习已保存，但计划任务标记失败：{result.taskError}。任务进度可能需要在计划页手动确认，产物不会丢。
            </p>
          ) : (
            <p className={styles.muted}>{result.bindingWarning || "任务状态未更新"}。产物已保存，不会丢。</p>
          )}
        </div>
      ) : (
        <button
          className={styles.primaryButton}
          disabled={busy || answers.some((a) => a < 0) || !openAnswer.trim()}
          onClick={() => void submit()}
        >
          {busy ? "保存中…" : "提交练习"}
        </button>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}

// ---------- offer 条款 + 草稿（谈薪） ----------

function OfferFlow({ onSaved }: { onSaved: () => void }) {
  const [opps, setOpps] = useState<OpportunityLite[]>([]);
  const [opportunityId, setOpportunityId] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newRole, setNewRole] = useState("");
  const [terms, setTerms] = useState({ currency: "CNY", base: "", bonus: "", equity: "", deadline: "", probation: "" });
  const [priorities, setPriorities] = useState("");
  const [offerId, setOfferId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ questions: string[]; draft: string; tradeoffs: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/coach/opportunities");
      const body = await res.json();
      if (body.ok) setOpps(body.opportunities ?? []);
    })();
  }, []);

  const saveTerms = async () => {
    setBusy(true);
    setError(null);
    try {
      let targetId = opportunityId;
      if (!targetId) {
        // 没有现成岗位时，用公司/角色建一个最小岗位来挂 offer
        const res = await fetch("/api/coach/opportunities", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunity: { company: newCompany, role: newRole, workspaceType: "job" } }),
        });
        const body = await res.json();
        if (!body.ok) { setError(body.error || "岗位创建失败"); return; }
        targetId = body.opportunity?.id ?? body.id;
        setOpportunityId(targetId);
      }
      const res = await fetch("/api/coach/offers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: targetId,
          offerId,
          terms: {
            currency: terms.currency || null,
            base: terms.base ? Number(terms.base) : null,
            bonus: terms.bonus ? Number(terms.bonus) : null,
            equity: terms.equity || null,
            deadline: terms.deadline || null,
            probation: terms.probation || null,
            unknowns: [!terms.equity && "股权/期权", !terms.probation && "试用期条款", !terms.deadline && "答复截止时间"].filter((v): v is string => typeof v === "string"),
          },
          priorities: priorities.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
        }),
      });
      const body = await res.json();
      if (!body.ok) { setError(body.error); return; }
      setOfferId(body.offer.id);
      onSaved();
    } catch {
      setError("未收到保存确认，条款仍保留在本页。请检查网络并核对历史后重试。");
    } finally {
      setBusy(false);
    }
  };

  const generateDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/negotiation-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const body = await res.json();
      if (body.ok) setDraft({ questions: body.questions, draft: body.draft, tradeoffs: body.tradeoffs });
      else setError(body.error);
    } catch {
      setError("沟通草稿暂时无法生成，已保存的条款不会丢失。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className={styles.heading}>梳理 offer 条款</h2>
      <p className={styles.muted}>缺项会如实标记为「未知」，不会猜测市场行情。</p>

      <label className={styles.fieldLabel}>
        挂到哪个岗位
        <select className={styles.select} value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
          <option value="">— 新建岗位 —</option>
          {opps.map((o) => <option key={o.id} value={o.id}>{o.company} · {o.role}</option>)}
        </select>
      </label>
      {!opportunityId && (
        <div className={styles.row}>
          <input className={styles.input} placeholder="公司" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
          <input className={styles.input} placeholder="职位" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
        </div>
      )}

      <div className={styles.row}>
        <input className={styles.input} placeholder="固定薪资（月）" value={terms.base} onChange={(e) => setTerms({ ...terms, base: e.target.value })} />
        <input className={styles.input} placeholder="奖金/浮动" value={terms.bonus} onChange={(e) => setTerms({ ...terms, bonus: e.target.value })} />
        <input className={styles.input} placeholder="股权/期权（没有留空）" value={terms.equity} onChange={(e) => setTerms({ ...terms, equity: e.target.value })} />
        <input className={styles.input} placeholder="答复截止" value={terms.deadline} onChange={(e) => setTerms({ ...terms, deadline: e.target.value })} />
      </div>
      <input className={styles.input} placeholder="你在意的优先级，用顿号分隔：现金、成长空间…" value={priorities} onChange={(e) => setPriorities(e.target.value)} />

      <div className={styles.row}>
        <button className={styles.primaryButton} disabled={busy} onClick={() => void saveTerms()}>
          {busy ? "保存中…" : offerId ? "更新条款" : "保存条款"}
        </button>
        <button className={styles.primaryButton} disabled={busy || !offerId} onClick={() => void generateDraft()}>
          {busy ? "生成中…" : "生成谈判问题与沟通草稿"}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}

      {draft && (
        <div className={styles.resultBox}>
          <h3>该向对方确认的问题</h3>
          <ul>{draft.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          <h3>沟通草稿</h3>
          <p className={styles.draftText}>{draft.draft}</p>
          {draft.tradeoffs.length > 0 && (
            <>
              <h3>取舍提醒</h3>
              <ul>{draft.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- 岗位比较（准备投递） ----------

function CompareFlow() {
  const [opps, setOpps] = useState<OpportunityLite[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{ table: Array<{ id: string; company: string; role: string; stage: string; hasJd: boolean }>; comparison: Array<{ company: string; requirements: string[]; matches: string[]; risks: string[]; nextStep: string }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/coach/opportunities");
      const body = await res.json();
      if (body.ok) setOpps(body.opportunities ?? []);
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected((cur) => cur.includes(id) ? cur.filter((v) => v !== id) : cur.length >= 4 ? cur : [...cur, id]);
  };

  const compare = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/compare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityIds: selected, question }),
      });
      const body = await res.json();
      if (body.ok) setResult(body);
      else setError(body.error);
    } catch {
      setError("岗位比较暂时失败，你选择的岗位已保留，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className={styles.heading}>比较候选岗位</h2>
      <p className={styles.muted}>选 2-4 个岗位。不生成匹配分——只摆要求、匹配点和风险。</p>
      <div className={styles.pickList}>
        {opps.map((o) => (
          <label key={o.id} className={styles.option}>
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.company} · {o.role}（{o.stage}{o.jdText ? "，有 JD" : "，暂无 JD"}）
          </label>
        ))}
        {opps.length === 0 && <p className={styles.muted}>还没有候选岗位——可以先粘贴一个 JD 到「JD 与证据」页。</p>}
      </div>
      <input className={styles.input} placeholder="这次比较你最关心什么？（可选）" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button className={styles.primaryButton} disabled={busy || selected.length < 2} onClick={() => void compare()}>
        {busy ? "比较中…" : "开始比较"}
      </button>
      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.resultBox}>
          {result.comparison.map((c, i) => (
            <div key={i}>
              <h3>{c.company} · {result.table[i]?.role}</h3>
              <p><strong>要求要点：</strong>{c.requirements.join("；")}</p>
              <p><strong>匹配点：</strong>{c.matches.join("；")}</p>
              <p><strong>风险：</strong>{c.risks.join("；")}</p>
              <p><strong>下一步：</strong>{c.nextStep}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
