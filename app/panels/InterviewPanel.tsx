"use client";

import { useState } from "react";

export default function InterviewPanel({ onAchieve }: { onAchieve?: (label: string) => void }) {
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewFeedback, setInterviewFeedback] = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const startInterview = async () => {
    setInterviewFeedback("");
    setInterviewLoading(true);
    try {
      const res = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) return;
      setInterviewSessionId(data.sessionId);
      setInterviewActive(true);
      // 首题直接展示在输入框上方
      if (data.question) {
        // 以 feedback 区临时显示当前题目
        setInterviewFeedback(`当前问题：\n${data.question}`);
      }
    } finally {
      setInterviewLoading(false);
    }
  };

  const sendAnswer = async () => {
    if (!inputValue.trim() || isLoading || !interviewActive || !interviewSessionId) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: interviewSessionId, message: inputValue.trim() }) });
      const data = await response.json();
      setInputValue("");
      if (data.done) {
        setInterviewFeedback(data.feedback || "");
        setInterviewActive(false);
        onAchieve?.("面试勇士 🧠");
      } else if (data.question) {
        setInterviewFeedback(`当前问题：\n${data.question}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAnswer();
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
      <h2 className="font-semibold text-gray-800">面试指导</h2>
      <div className="flex items-center gap-2">
        <button onClick={startInterview} disabled={interviewLoading || interviewActive} className={`px-3 py-2 rounded-xl text-white text-sm transition-colors ${interviewActive ? "bg-gray-400" : "bg-[var(--accent)] hover:bg-[var(--accent-600)]"}`}>{interviewActive ? "面试进行中" : interviewLoading ? "准备中…" : "开始模拟面试"}</button>
      </div>
      {!!interviewFeedback && (
        <div className="border border-emerald-100 rounded-2xl p-4 bg-emerald-50">
          <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{interviewFeedback}</pre>
        </div>
      )}
      <div className="border border-gray-200 rounded-2xl p-4">
        <div className="text-xs text-gray-500 mb-2">在下方输入你的回答</div>
        <div className="flex gap-2">
          <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder={interviewActive ? "输入你的面试回答..." : "请先点击“开始模拟面试”"} className="flex-1 px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--blue-500)] focus:border-transparent bg-white" disabled={isLoading || !interviewActive} />
          <button onClick={sendAnswer} disabled={!inputValue.trim() || isLoading || !interviewActive} className="px-5 py-3 text-white rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors bg-[var(--accent)] hover:bg-[var(--accent-600)]">回答</button>
        </div>
      </div>
    </div>
  );
}


