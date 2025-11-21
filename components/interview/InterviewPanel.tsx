/**
 * 模拟面试面板组件
 * 三层布局：左部（聊天输入）、中间（问题卡片+提示）、右部（白板总结）
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import InputBar from "../InputBar";
import Whiteboard, { WhiteboardData } from "../Whiteboard";
import QuestionCard from "./QuestionCard";
import TipsCard from "./TipsCard";
import EvaluationCard from "./EvaluationCard";
import {
  useInterviewStore,
  RoundType,
} from "@/store/interviewStore";

interface InterviewPanelProps {
  currentStage: string;
  whiteboardData: WhiteboardData;
  onWhiteboardUpdate?: (data: WhiteboardData) => void;
}

export default function InterviewPanel({
  currentStage,
  whiteboardData,
  onWhiteboardUpdate,
}: InterviewPanelProps) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const summaryHandledRef = useRef<string | null>(null);
  const selectedRoundRef = useRef<RoundType | null>(null);

  const {
    conversation,
    flowStep,
    mode,
    roundType,
    totalQuestions,
    targetRole,
    currentQuestionIndex,
    questions,
    roundCompleted,
    latestSummary,
    isLoadingQuestion,
    isEvaluating,
    beginInterviewIntro,
    addUserMessage,
    addAssistantMessage,
    setMode,
    setFlowStep,
    setTargetRole,
    setTotalQuestions,
    setRound,
    loadRound,
    getCurrentQuestion,
    answerQuestion,
    nextQuestion,
    retryCurrentQuestion,
  } = useInterviewStore();

  const currentQuestion = getCurrentQuestion ? getCurrentQuestion() : null;
  const tips = currentQuestion?.tips;
  const evaluation = currentQuestion?.evaluation;
  const showEvaluation = Boolean(currentQuestion && evaluation && currentQuestion.status === "evaluated");

  const introContext = useMemo(() => {
    const intentRole = whiteboardData.intentRole || (whiteboardData as any).intent_text || null;
    const projectNames = whiteboardData.starProjects
      ? whiteboardData.starProjects
          .map((project) => project?.title)
          .filter((title): title is string => Boolean(title))
      : undefined;
    return { intentRole, projectNames };
  }, [whiteboardData]);

  useEffect(() => {
    if (conversation.length === 0) {
      beginInterviewIntro(introContext);
    }
  }, [conversation.length, beginInterviewIntro, introContext]);

  useEffect(() => {
    if (!targetRole && introContext.intentRole) {
      setTargetRole(introContext.intentRole);
    }
  }, [introContext.intentRole, setTargetRole, targetRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    if (!latestSummary || !onWhiteboardUpdate) {
      return;
    }
    if (summaryHandledRef.current === latestSummary.reportId) {
      return;
    }

    summaryHandledRef.current = latestSummary.reportId;

    const scores = latestSummary.summary?.scores;
    const scoreValues = scores ? Object.values(scores) : [];
    const avgScore = scoreValues.length
      ? Math.round(scoreValues.reduce((acc, val) => acc + val, 0) / scoreValues.length)
      : undefined;

    const reportEntry = {
      id: latestSummary.reportId,
      round: `${latestSummary.roundType || roundType || "模拟面试"}总结`,
      overallScore: avgScore,
      strengths: latestSummary.summary?.highlights || [],
      improvements: latestSummary.summary?.gaps || [],
      questions: (latestSummary.questions || []).map((q: any) => ({
        question: q.question,
        userAnswer: q.userAnswer,
        aiFeedback: q.evaluation?.tips,
        score: q.evaluation
          ? Math.round(
              (q.evaluation.accuracy +
                q.evaluation.detail +
                q.evaluation.logic +
                q.evaluation.confidence) /
              4
            )
          : undefined,
      })),
      createdAt: new Date().toISOString(),
    };

    const updatedBoard: WhiteboardData = {
      ...whiteboardData,
      interviewReports: [
        ...(whiteboardData.interviewReports || []).filter((item) => item.id !== reportEntry.id),
        reportEntry,
      ],
    };

    onWhiteboardUpdate(updatedBoard);
  }, [latestSummary, whiteboardData, onWhiteboardUpdate, roundType]);

  useEffect(() => {
    if (roundType) {
      selectedRoundRef.current = roundType;
    }
  }, [roundType]);

  const effectiveRole = targetRole || introContext.intentRole || "待确认岗位";
  const roundLabel = roundType || "待选择轮次";
  const questionNumber = currentQuestion ? currentQuestionIndex + 1 : 0;
  const totalCount = totalQuestions ?? (questions.length > 0 ? questions.length : undefined);
  const progressLabel =
    questionNumber > 0 && typeof totalCount === "number"
      ? `第 ${questionNumber} 题 / 共 ${totalCount} 题`
      : "题目尚未生成";

  const canProceedNext = Boolean(currentQuestion && currentQuestion.status === "evaluated");
  const inputDisabled = isEvaluating || isLoadingQuestion;

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (isEvaluating) {
      addAssistantMessage("我正在评估上一题，请稍等片刻。");
      return;
    }

    addUserMessage(trimmed);
    setDraft("");

    if (flowStep === "awaitingMode" || flowStep === "idle") {
      if (/复盘/.test(trimmed)) {
        setMode("review");
        setFlowStep("review");
        addAssistantMessage("收到，目前面试复盘功能还在开发中，如需模拟面试可以随时告诉我。");
        return;
      }

      if (/模拟|面试|mock/i.test(trimmed)) {
        setMode("mock");
        if (!targetRole && !introContext.intentRole) {
          setFlowStep("awaitingRole");
          addAssistantMessage("好的，我们来安排模拟面试。先告诉我你的目标岗位或想练习的方向。");
        } else {
          setFlowStep("awaitingRound");
          addAssistantMessage("请告诉我想练习的面试轮次：业务面 / 项目深挖 / 技术面 / 总监面 / HR面？");
        }
        return;
      }

      addAssistantMessage("请告诉我你想进行【模拟面试】还是【面试复盘】。");
      return;
    }

    if (flowStep === "review") {
      addAssistantMessage("复盘功能开发中，如需模拟面试请告诉我。");
      setFlowStep("awaitingMode");
      return;
    }

    if (flowStep === "awaitingRole") {
      setTargetRole(trimmed);
      setFlowStep("awaitingRound");
      addAssistantMessage(`了解，你的目标岗位是${trimmed}。接下来告诉我想模拟的面试轮次？`);
      return;
    }

    if (flowStep === "awaitingRound") {
      const normalized = trimmed.replace(/\s+/g, "").toLowerCase();
      const matchedRound = ((): RoundType => {
        if (normalized.includes("业务")) return "业务面";
        if (normalized.includes("项目")) return "项目深挖";
        if (normalized.includes("技术") || normalized.includes("tech")) return "技术面";
        if (normalized.includes("总监") || normalized.includes("主管")) return "总监面";
        if (normalized.includes("hr") || normalized.includes("人力")) return "HR面";
        return null;
      })();

      if (!matchedRound) {
        addAssistantMessage("为了匹配合适的题目，请从业务面 / 项目深挖 / 技术面 / 总监面 / HR面中选择一个。");
        return;
      }

      setRound(matchedRound);
      selectedRoundRef.current = matchedRound;
      setFlowStep("awaitingCount");
      addAssistantMessage(`了解，我们就按照${matchedRound}来模拟。你希望我出多少道题？`);
      return;
    }

    if (flowStep === "awaitingCount") {
      const countMatch = trimmed.match(/\d+/);
      if (!countMatch) {
        addAssistantMessage("请告诉我想练习的题目数量，例如“5道题”。");
        return;
      }

      const count = Math.max(1, Math.min(parseInt(countMatch[0], 10), 20));
      setTotalQuestions(count);

      const effectiveRound = roundType || selectedRoundRef.current;
      if (!effectiveRound) {
        addAssistantMessage("我还没有确认模拟的轮次，请先告诉我想练习的轮次。");
        setFlowStep("awaitingRound");
        return;
      }

      addAssistantMessage(`好的，我们将在${effectiveRound}中模拟 ${count} 道题。我来准备第一题，请稍候。`);
      await loadRound(effectiveRound);
      return;
    }

    if (flowStep === "ready") {
      if (!currentQuestion) {
        addAssistantMessage("题目还没有准备好，请先完成配置。");
        return;
      }
      await answerQuestion(currentQuestion.id, trimmed);
      return;
    }

    addAssistantMessage("已记录，如需调整流程请告诉我。");
  };

  const handleNextQuestion = async () => {
    if (isLoadingQuestion) {
      return;
    }
    if (!currentQuestion) {
      addAssistantMessage("当前没有待回答的题目。可以告诉我想练习的轮次和题数。");
      return;
    }
    if (currentQuestion.status !== "evaluated") {
      addAssistantMessage("请先回答当前题目并查看评估结果，再进行下一题。");
      return;
    }
    await nextQuestion();
  };

  const handleRetry = () => {
    if (!currentQuestion) {
      addAssistantMessage("当前没有题目可重新作答。");
      return;
    }
    retryCurrentQuestion();
  };

  const summaryCard = latestSummary && roundCompleted && questions.length === 0 ? (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white border border-cyan-200 rounded-xl shadow-sm p-6 space-y-4"
    >
      <div>
        <h3 className="text-lg font-semibold text-gray-900">本轮模拟面试完成</h3>
        <p className="text-sm text-gray-600 mt-1">总结已同步至右侧白板，新一轮面试准备就绪。</p>
      </div>
      {latestSummary.summary?.scores && (
        <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
          {Object.entries(latestSummary.summary.scores).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium capitalize">{key}</span>
              <span className="text-cyan-600 font-semibold">{value}</span>
            </div>
          ))}
        </div>
      )}
      {latestSummary.summary?.highlights && latestSummary.summary.highlights.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-green-700 mb-2">亮点</h4>
          <ul className="space-y-1 text-sm text-gray-700">
            {latestSummary.summary.highlights.map((item: string, index: number) => (
              <li key={index}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
      {latestSummary.summary?.gaps && latestSummary.summary.gaps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-orange-700 mb-2">改进建议</h4>
          <ul className="space-y-1 text-sm text-gray-700">
            {latestSummary.summary.gaps.map((item: string, index: number) => (
              <li key={index}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  ) : null;

  return (
    <div className="h-full flex flex-col md:flex-row bg-neutral-50">
      {/* 左侧：对话输入区 */}
      <aside className="md:w-[28%] xl:w-[26%] border-r border-gray-200 bg-white flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">模拟面试对话</h2>
          <p className="text-xs text-gray-500 mt-1">与面试官实时互动，梳理思路</p>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {conversation.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <p className="whitespace-pre-line">{msg.content}</p>
                <span
                  className={`mt-2 block text-[10px] uppercase tracking-wide ${
                    msg.role === "user" ? "text-blue-50" : "text-gray-400"
                  }`}
                >
                  {msg.role === "user" ? "我" : "AI 面试官"} · {new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-gray-200 p-4">
          <InputBar
            value={draft}
            onChange={setDraft}
            onSend={() => {
              void handleSend();
            }}
            isLoading={isEvaluating}
            disabled={inputDisabled}
          />
        </div>
      </aside>

      {/* 中间：动态卡片区域 */}
      <main className="flex-1 min-h-full flex flex-col px-6 py-6 space-y-6 overflow-y-auto">
        {/* 顶部信息卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-wrap items-center gap-4"
        >
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
              {effectiveRole}
            </span>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">
              {roundLabel}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            当前进度：
            <span className="font-semibold text-gray-800 ml-1">
              {isLoadingQuestion && !currentQuestion ? "题目准备中..." : progressLabel}
            </span>
          </div>
        </motion.div>

        {/* 问题卡片 / 总结 */}
        {summaryCard ? (
          summaryCard
        ) : currentQuestion ? (
          <QuestionCard
            question={currentQuestion}
            questionNumber={questionNumber || 1}
            totalQuestions={typeof totalCount === "number" && totalCount > 0 ? totalCount : 1}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-dashed border-cyan-200 rounded-xl p-6 flex flex-col gap-2 text-sm text-gray-600"
          >
            <span className="font-semibold text-gray-800">题目尚未生成</span>
            <span>
              请在左侧告诉我想进行模拟还是复盘、目标岗位、面试轮次以及练习题量，我会立即准备第一题。
            </span>
          </motion.div>
        )}

        {/* Tips / Evaluation 区域 */}
        {summaryCard ? null : (
          <div className="space-y-4">
            {showEvaluation && evaluation ? (
              <EvaluationCard evaluation={evaluation} />
            ) : tips ? (
              <TipsCard tips={tips} />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg border border-cyan-200 shadow-sm p-6 text-sm text-gray-600"
              >
                <span className="font-semibold text-gray-800 block mb-2">提示将显示在这里</span>
                <p>
                  当第一题生成后，会提供考察意图、回答要点和结构建议，帮助你高效作答。
                </p>
              </motion.div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="pt-2 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleRetry}
            disabled={!currentQuestion || isLoadingQuestion}
          >
            再次作答
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg shadow-sm hover:from-cyan-600 hover:to-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => {
              void handleNextQuestion();
            }}
            disabled={!canProceedNext || isLoadingQuestion}
          >
            下一题
          </button>
        </div>
      </main>

      {/* 右侧：白板区域 */}
      <aside className="md:w-[30%] xl:w-[28%] border-l border-gray-200 bg-white flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">实时总结</h2>
          <p className="text-xs text-gray-500 mt-1">AI 白板同步记录关键信息</p>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Whiteboard
            data={whiteboardData}
            currentStage={currentStage}
            onUpdate={onWhiteboardUpdate}
          />
        </div>
      </aside>
    </div>
  );
}

