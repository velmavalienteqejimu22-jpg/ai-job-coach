/**
 * 面试 Store 使用示例
 * 展示如何在 React 组件中使用 interviewStore
 */

"use client";

import { useEffect } from "react";
import { useInterviewStore, RoundType } from "./interviewStore";

export default function InterviewExample() {
  // 从 store 中获取状态和方法
  const {
    // 状态
    sessionId,
    userId,
    roundType,
    roundIndex,
    currentQuestionIndex,
    questions,
    roundCompleted,
    history,

    // 方法
    initInterview,
    loadRound,
    answerQuestion,
    setEvaluation,
    nextQuestion,
    prevQuestion,
    finishRound,
    resetRound,
    getCurrentQuestion,
  } = useInterviewStore();

  // 示例 1: 初始化面试会话
  const handleInitInterview = () => {
    const sessionId = "session_123";
    const userId = "user_456";
    const suggestedRound: RoundType = "技术面";

    initInterview(sessionId, userId, suggestedRound);
  };

  // 示例 2: 加载轮次
  const handleLoadRound = async () => {
    await loadRound("技术面");
  };

  // 示例 3: 获取当前问题并回答
  const handleAnswerCurrentQuestion = async () => {
    const currentQuestion = getCurrentQuestion();

    if (!currentQuestion) {
      console.log("没有当前问题");
      return;
    }

    const answerText = "这是我的回答...";
    await answerQuestion(currentQuestion.id, answerText);
  };

  // 示例 4: 设置评估结果
  const handleSetEvaluation = () => {
    const currentQuestion = getCurrentQuestion();

    if (!currentQuestion) {
      return;
    }

    setEvaluation(currentQuestion.id, {
      accuracy: 85,
      detail: 90,
      logic: 80,
      confidence: 75,
      tips: "回答很好，但可以更具体一些",
    });
  };

  // 示例 5: 导航问题
  const handleNext = () => {
    nextQuestion();
  };

  const handlePrev = () => {
    prevQuestion();
  };

  // 示例 6: 完成轮次
  const handleFinishRound = () => {
    finishRound({
      reportId: "report_789",
      summary: "面试总结...",
    });
  };

  // 示例 7: 重置轮次
  const handleReset = () => {
    resetRound();
  };

  // 示例 8: 在组件挂载时初始化
  useEffect(() => {
    // 从 localStorage 或其他地方获取 sessionId 和 userId
    const savedSessionId = localStorage.getItem("sessionId");
    const savedUserId = localStorage.getItem("userId");

    if (savedSessionId && savedUserId) {
      initInterview(savedSessionId, savedUserId);
    }
  }, []);

  // 渲染当前问题
  const currentQuestion = getCurrentQuestion();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">面试 Store 使用示例</h1>

      {/* 显示当前状态 */}
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <h2 className="font-semibold mb-2">当前状态：</h2>
        <p>会话ID: {sessionId || "未设置"}</p>
        <p>用户ID: {userId || "未设置"}</p>
        <p>轮次类型: {roundType || "未设置"}</p>
        <p>轮次编号: {roundIndex}</p>
        <p>当前问题索引: {currentQuestionIndex}</p>
        <p>问题总数: {questions.length}</p>
        <p>轮次完成: {roundCompleted ? "是" : "否"}</p>
        <p>历史记录数: {history.length}</p>
      </div>

      {/* 操作按钮 */}
      <div className="space-y-2 mb-6">
        <button
          onClick={handleInitInterview}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          初始化面试
        </button>
        <button
          onClick={handleLoadRound}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          加载技术面
        </button>
        <button
          onClick={handleAnswerCurrentQuestion}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          回答当前问题
        </button>
        <button
          onClick={handleSetEvaluation}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          设置评估
        </button>
        <button
          onClick={handleNext}
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
        >
          下一题
        </button>
        <button
          onClick={handlePrev}
          className="px-4 py-2 bg-pink-500 text-white rounded hover:bg-pink-600"
        >
          上一题
        </button>
        <button
          onClick={handleFinishRound}
          className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
        >
          完成轮次
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          重置轮次
        </button>
      </div>

      {/* 显示当前问题 */}
      {currentQuestion && (
        <div className="p-4 bg-white border rounded">
          <h3 className="font-semibold mb-2">当前问题：</h3>
          <p className="mb-2">{currentQuestion.q}</p>
          <p className="text-sm text-gray-600">状态: {currentQuestion.status}</p>
          {currentQuestion.userAnswer && (
            <div className="mt-2">
              <p className="font-semibold">用户回答：</p>
              <p className="text-gray-700">{currentQuestion.userAnswer}</p>
            </div>
          )}
          {currentQuestion.evaluation && (
            <div className="mt-2">
              <p className="font-semibold">评估结果：</p>
              <p>准确性: {currentQuestion.evaluation.accuracy}</p>
              <p>详细度: {currentQuestion.evaluation.detail}</p>
              <p>逻辑性: {currentQuestion.evaluation.logic}</p>
              <p>自信度: {currentQuestion.evaluation.confidence}</p>
              <p>建议: {currentQuestion.evaluation.tips}</p>
            </div>
          )}
        </div>
      )}

      {/* 显示所有问题列表 */}
      {questions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">所有问题：</h3>
          <ul className="space-y-2">
            {questions.map((q, index) => (
              <li
                key={q.id}
                className={`p-2 border rounded ${
                  index === currentQuestionIndex ? "bg-blue-100" : ""
                }`}
              >
                <p className="font-semibold">Q{index + 1}: {q.q}</p>
                <p className="text-sm text-gray-600">状态: {q.status}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 显示历史记录 */}
      {history.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">历史记录：</h3>
          <ul className="space-y-2">
            {history.map((h, index) => (
              <li key={index} className="p-2 border rounded">
                <p>轮次类型: {h.roundType}</p>
                <p>时间: {new Date(h.timestamp).toLocaleString()}</p>
                <p>报告ID: {h.reportId}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

