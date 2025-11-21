"use client";

import { useState, useEffect, useCallback } from "react";
import { useApp, InterviewRoundType } from "../context/AppContext";
import { UserStage, StageNames } from "@/lib/stage";
import { CheckCircle, Lightbulb, Send, ArrowLeft, ChevronDown, Activity, Compass, Layers, FileText, DollarSign } from "./icons";

const STAGE_CONFIG: Record<UserStage, { label: string; icon: any }> = {
  career_planning: { label: "职业规划", icon: Compass },
  project_review: { label: "经历复盘", icon: Layers },
  resume_optimization: { label: "简历优化", icon: FileText },
  application_strategy: { label: "投递策略", icon: Activity },
  interview: { label: "模拟面试", icon: Activity },
  salary_talk: { label: "谈薪策略", icon: DollarSign },
  offer: { label: "Offer选择", icon: Activity },
};

export default function InterviewStage() {
  const { state, dispatch } = useApp();
  const { interviewState, chatSessionId, user, isLoading } = state;
  
  const [interviewQuestions, setInterviewQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedRoundType, setSelectedRoundType] = useState<InterviewRoundType>("业务面");
  const [questionCount, setQuestionCount] = useState<number>(3);
  const [questionCountMode, setQuestionCountMode] = useState<"ai" | "user">("user");
  const [showStageMenu, setShowStageMenu] = useState(false);

  // 点击外部关闭菜单
  useEffect(() => {
    if (showStageMenu) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.stage-menu-container')) {
          setShowStageMenu(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showStageMenu]);

  // 启动面试
  const startInterview = useCallback(async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      // 如果没有 sessionId，生成一个临时的
      const sessionId = chatSessionId || `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // 如果没有 userId，使用 user.id 或生成一个临时的
      const userId = user?.id || `user_${Date.now()}`;
      
      const response = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_round",
          roundType: selectedRoundType,
          questionCount: questionCountMode === "ai" ? undefined : questionCount,
          sessionId: sessionId,
          userId: userId,
        }),
      });
      const data = await response.json();
      if (data.type === "next-question" && data.payload?.question) {
        const question = data.payload.question;
        dispatch({
          type: "UPDATE_INTERVIEW_STATE",
          payload: {
            active: true,
            questionIndex: 0,
            status: "question",
            currentAnswer: "",
            currentQuestion: question,
            roundType: selectedRoundType,
            questionCount: questionCount,
            questionCountMode: questionCountMode,
            questions: [question],
            evaluations: [],
          },
        });
        setInterviewQuestions([question]);
      }
    } catch (error) {
      console.error("开始面试失败:", error);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [dispatch, selectedRoundType, questionCount, questionCountMode, chatSessionId, user?.id]);

  // 提交回答
  const handleAnswer = async () => {
    if (!interviewState.currentAnswer.trim() || !interviewState.currentQuestion) return;

    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          questionId: interviewState.currentQuestion.id,
          answer: interviewState.currentAnswer,
          roundType: selectedRoundType,
        }),
      });
      const data = await response.json();
      if (data.type === "evaluation" && data.payload?.evaluation) {
        const evaluation = data.payload.evaluation;
        const updatedEvaluations = [...(interviewState.evaluations || []), {
          questionId: interviewState.currentQuestion!.id,
          ...evaluation,
        }];
        dispatch({
          type: "UPDATE_INTERVIEW_STATE",
          payload: {
            status: "analysis",
            currentEvaluation: {
              questionId: interviewState.currentQuestion!.id,
              ...evaluation,
            },
            evaluations: updatedEvaluations,
          },
        });

        // 自动加载下一题（延迟3秒，让用户看到评估结果）
        const totalQuestions = interviewState.questionCount || questionCount;
        const currentIdx = currentQuestionIndex;
        setTimeout(async () => {
          if (currentIdx < totalQuestions - 1) {
            // 还有下一题，加载下一题
            await handleNextAuto();
          } else {
            // 最后一题，完成轮次
            await handleFinishRound();
          }
        }, 3000);
      }
    } catch (error) {
      console.error("提交回答失败:", error);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // 自动加载下一题（不显示加载状态，因为已经在评估阶段）
  const handleNextAuto = async () => {
    const totalQuestions = interviewState.questionCount || questionCount;
    try {
      const response = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next_question",
          roundType: selectedRoundType,
          questionCount: totalQuestions,
          recentMessages: interviewQuestions.map((q, idx) => ({
            role: "assistant" as const,
            content: q.q,
          })),
        }),
      });
      const data = await response.json();
      if (data.type === "next-question" && data.payload?.question) {
        const newQuestion = data.payload.question;
        const newQuestions = [...interviewQuestions, newQuestion];
        setInterviewQuestions(newQuestions);
        const nextIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
        dispatch({
          type: "UPDATE_INTERVIEW_STATE",
          payload: {
            questionIndex: nextIndex,
            status: "question",
            currentAnswer: "",
            currentQuestion: newQuestion,
            questions: newQuestions,
            currentEvaluation: undefined, // 清除当前评估
          },
        });
      } else if (data.type === "round-complete") {
        // 完成轮次，生成报告
        await finishRound(data.payload);
      }
    } catch (error) {
      console.error("自动加载下一题失败:", error);
    }
  };

  // 完成轮次
  const handleFinishRound = async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish_round",
          roundType: selectedRoundType,
          recentMessages: interviewQuestions.map((q, idx) => {
            const evaluation = interviewState.evaluations?.find((e) => e.questionId === q.id);
            return {
              role: "assistant" as const,
              content: q.q,
            };
          }),
        }),
      });
      const data = await response.json();
      if (data.type === "round-complete") {
        await finishRound(data.payload);
      }
    } catch (error) {
      console.error("完成轮次失败:", error);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // 手动下一题（用户点击按钮）
  const handleNext = async () => {
    const totalQuestions = interviewState.questionCount || questionCount;
    if (currentQuestionIndex < totalQuestions - 1) {
      // 获取下一题
      try {
        dispatch({ type: "SET_LOADING", payload: true });
        const response = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "next_question",
            roundType: selectedRoundType,
            questionCount: totalQuestions,
            recentMessages: interviewQuestions.map((q, idx) => ({
              role: "assistant" as const,
              content: q.q,
            })),
          }),
        });
        const data = await response.json();
        if (data.type === "next-question" && data.payload?.question) {
          const newQuestion = data.payload.question;
          const newQuestions = [...interviewQuestions, newQuestion];
          setInterviewQuestions(newQuestions);
          const nextIndex = currentQuestionIndex + 1;
          setCurrentQuestionIndex(nextIndex);
          dispatch({
            type: "UPDATE_INTERVIEW_STATE",
            payload: {
              questionIndex: nextIndex,
              status: "question",
              currentAnswer: "",
              currentQuestion: newQuestion,
              questions: newQuestions,
            },
          });
        } else if (data.type === "round-complete") {
          // 完成轮次，生成报告
          await finishRound(data.payload);
        }
      } catch (error) {
        console.error("获取下一题失败:", error);
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } else {
      // 完成轮次
      await handleFinishRound();
    }
  };

  // 完成轮次，生成报告
  const finishRound = async (payload: any) => {
    const report = {
      id: payload.reportId || `report_${Date.now()}`,
      round: selectedRoundType,
      questionCount: interviewState.questionCount || questionCount,
      questions: interviewQuestions.map((q, idx) => {
        const evaluation = interviewState.evaluations?.find((e) => e.questionId === q.id);
        return {
          question: q.q,
          userAnswer: idx === currentQuestionIndex ? interviewState.currentAnswer : "",
          evaluation: evaluation,
        };
      }),
      overallScore: payload.summary?.scores,
      strengths: payload.summary?.highlights || [],
      improvements: payload.summary?.gaps || [],
      suggestions: payload.summary?.practiceSuggestions || [],
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: "ADD_INTERVIEW_REPORT", payload: report });
    dispatch({
      type: "UPDATE_INTERVIEW_STATE",
      payload: { active: false, status: "setup" },
    });
    alert("本轮模拟面试结束！报告已保存到白板。");
  };

  const question = interviewState.currentQuestion || interviewQuestions[currentQuestionIndex];

  // 设置阶段：选择轮次和题数
  if (interviewState.status === "setup" || !interviewState.active) {
    return (
      <div className="flex flex-col h-full p-6 bg-slate-100/50 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
          {/* 顶部导航栏 */}
          <div className="mb-6 relative stage-menu-container">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowStageMenu(!showStageMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={16} />
                <span>返回阶段选择</span>
                <ChevronDown size={14} className={`ml-1 text-slate-400 transition-transform ${showStageMenu ? "rotate-180" : ""}`} />
              </button>
              <div className="h-4 w-px bg-slate-300"></div>
              <h2 className="text-2xl font-bold text-slate-800">模拟面试</h2>
            </div>
            
            {/* 阶段选择菜单 (Dropdown) */}
            {showStageMenu && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-2 gap-2 z-50 w-64 animate-fade-in">
                {(Object.keys(STAGE_CONFIG) as UserStage[]).map((stageId) => {
                  const config = STAGE_CONFIG[stageId];
                  const Icon = config.icon;
                  return (
                    <button
                      key={stageId}
                      onClick={() => {
                        dispatch({ type: "SWITCH_STAGE", payload: stageId });
                        setShowStageMenu(false);
                      }}
                      className={`flex items-center p-2 rounded-md text-sm transition ${
                        state.currentStage === stageId
                          ? "bg-blue-50 text-blue-600"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <Icon size={16} className="mr-2 opacity-70" />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 轮次选择 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">选择面试轮次</h3>
            <div className="grid grid-cols-2 gap-3">
              {(["业务面", "技术面", "HR面", "主管面"] as InterviewRoundType[]).map((round) => (
                <button
                  key={round}
                  onClick={() => setSelectedRoundType(round)}
                  className={`p-4 rounded-lg border-2 transition ${
                    selectedRoundType === round
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold">{round}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 题数设置 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">题数设置</h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={questionCountMode === "user"}
                    onChange={() => setQuestionCountMode("user")}
                    className="mr-2"
                  />
                  自定义题数
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={questionCountMode === "ai"}
                    onChange={() => setQuestionCountMode("ai")}
                    className="mr-2"
                  />
                  AI 推荐
                </label>
              </div>
              {questionCountMode === "user" && (
                <div>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(parseInt(e.target.value) || 3)}
                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <span className="ml-2 text-sm text-slate-600">题</span>
                </div>
              )}
            </div>
          </div>

          {/* 开始按钮 */}
          <button
            onClick={startInterview}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
          >
            {isLoading ? "启动中..." : "开始面试"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 bg-slate-100/50 overflow-y-auto">
      {/* 顶部导航栏 */}
      <div className="mb-6 relative stage-menu-container">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStageMenu(!showStageMenu)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={16} />
              <span>返回阶段选择</span>
              <ChevronDown size={14} className={`ml-1 text-slate-400 transition-transform ${showStageMenu ? "rotate-180" : ""}`} />
            </button>
            <div className="h-4 w-px bg-slate-300"></div>
            <h2 className="text-xl font-bold text-slate-800">模拟面试 - {selectedRoundType}</h2>
          </div>
          <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
            {currentQuestionIndex + 1} / {interviewState.questionCount || questionCount}
          </span>
        </div>
        
        {/* 阶段选择菜单 (Dropdown) */}
        {showStageMenu && (
          <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-2 gap-2 z-50 w-64 animate-fade-in">
            {(Object.keys(STAGE_CONFIG) as UserStage[]).map((stageId) => {
              const config = STAGE_CONFIG[stageId];
              const Icon = config.icon;
              return (
                <button
                  key={stageId}
                  onClick={() => {
                    dispatch({ type: "SWITCH_STAGE", payload: stageId });
                    setShowStageMenu(false);
                  }}
                  className={`flex items-center p-2 rounded-md text-sm transition ${
                    state.currentStage === stageId
                      ? "bg-blue-50 text-blue-600"
                      : "hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  <Icon size={16} className="mr-2 opacity-70" />
                  {config.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 问题卡片 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6 animate-fade-in">
        <div className="bg-blue-600 p-6 text-white">
          <div className="text-blue-200 text-sm font-bold uppercase tracking-wider mb-2">当前问题</div>
          <div className="text-2xl font-serif leading-relaxed">"{question?.q || ""}"</div>
        </div>

        <div className="p-6">
          {interviewState.status === "question" && (
            <div>
              {/* Tips 显示 */}
              <div className="mb-4 space-y-3">
                <div className="flex items-start">
                  <Lightbulb className="text-amber-500 mr-2 mt-1" size={20} />
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-700 text-sm mb-2">回答提示</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-semibold text-slate-600">考察意图：</span>
                        <span className="text-slate-700">{question?.tips?.intent || ""}</span>
                      </div>
                      {question?.tips?.keyPoints && question.tips.keyPoints.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-600">需要关注点：</span>
                          <ul className="list-disc list-inside text-slate-700 ml-2">
                            {question.tips.keyPoints.map((point: string, idx: number) => (
                              <li key={idx}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-600">回答框架：</span>
                        <span className="text-slate-700">{question?.tips?.framework || ""}</span>
                      </div>
                      {question?.tips?.industryNotes && (
                        <div>
                          <span className="font-semibold text-slate-600">行业特性：</span>
                          <span className="text-slate-700">{question.tips.industryNotes}</span>
                        </div>
                      )}
                      {question?.tips?.pitfalls && question.tips.pitfalls.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-600">需要避免：</span>
                          <ul className="list-disc list-inside text-slate-700 ml-2">
                            {question.tips.pitfalls.map((pitfall: string, idx: number) => (
                              <li key={idx}>{pitfall}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {question?.tips?.proTips && question.tips.proTips.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-600">内行窍门：</span>
                          <ul className="list-disc list-inside text-slate-700 ml-2">
                            {question.tips.proTips.map((tip: string, idx: number) => (
                              <li key={idx}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <textarea
                  className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[150px] resize-none"
                  placeholder="在此输入你的回答..."
                  value={interviewState.currentAnswer}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_INTERVIEW_STATE",
                      payload: { currentAnswer: e.target.value },
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (interviewState.currentAnswer.trim() && !isLoading) {
                        handleAnswer();
                      }
                    }
                  }}
                ></textarea>
                <button
                  onClick={handleAnswer}
                  disabled={!interviewState.currentAnswer.trim() || isLoading}
                  className="absolute bottom-4 right-4 bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="发送回答"
                >
                  <Send size={18} />
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                按 Enter 发送，Shift + Enter 换行
              </div>
            </div>
          )}

          {interviewState.status === "analysis" && interviewState.currentEvaluation && (
            <div className="animate-fade-in">
              <h4 className="font-bold text-green-600 flex items-center mb-4">
                <CheckCircle className="mr-2" size={20} /> AI 分析反馈
              </h4>

              {/* 评估维度 */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                  <div className="text-xs text-blue-600 font-semibold mb-1">准确性</div>
                  <div className="text-2xl font-bold text-blue-700">{interviewState.currentEvaluation.accuracy}</div>
                </div>
                <div className="bg-green-50 border border-green-100 p-4 rounded-lg">
                  <div className="text-xs text-green-600 font-semibold mb-1">语法</div>
                  <div className="text-2xl font-bold text-green-700">{interviewState.currentEvaluation.grammar}</div>
                </div>
                {interviewState.currentEvaluation.detail !== undefined && (
                  <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg">
                    <div className="text-xs text-purple-600 font-semibold mb-1">细节</div>
                    <div className="text-2xl font-bold text-purple-700">{interviewState.currentEvaluation.detail}</div>
                  </div>
                )}
                <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg">
                  <div className="text-xs text-orange-600 font-semibold mb-1">自信度</div>
                  <div className="text-2xl font-bold text-orange-700">{interviewState.currentEvaluation.confidence}</div>
                </div>
              </div>

              {/* 改进建议 */}
              <div className="bg-green-50 border border-green-100 p-4 rounded-lg text-sm text-slate-700 mb-4">
                <div className="font-semibold text-green-700 mb-1">改进建议：</div>
                <div>{interviewState.currentEvaluation.tips}</div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() =>
                    dispatch({
                      type: "UPDATE_INTERVIEW_STATE",
                      payload: { status: "question", currentAnswer: "" },
                    })
                  }
                  className="text-slate-500 hover:text-slate-700 px-4 py-2 text-sm"
                >
                  重新作答
                </button>
                <button
                  onClick={handleNext}
                  className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition font-medium"
                >
                  {currentQuestionIndex < (interviewState.questionCount || questionCount) - 1 ? "下一题 →" : "完成面试"}
                </button>
              </div>
              <div className="mt-3 text-xs text-slate-400 text-center animate-pulse">
                ⏱️ 评估结果将在 3 秒后自动加载下一题
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
