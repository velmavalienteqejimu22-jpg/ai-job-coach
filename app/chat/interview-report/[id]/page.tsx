"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface InterviewReport {
  id: string;
  round: string;
  questions?: Array<{
    question: string;
    userAnswer?: string;
    aiFeedback?: string;
    score?: number;
  }>;
  overallScore?: number;
  strengths?: string[];
  improvements?: string[];
  createdAt?: string;
}

export default function InterviewReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<InterviewReport | null>(null);

  useEffect(() => {
    // 从 localStorage 或全局状态获取面试报告数据
    try {
      const whiteboardData = localStorage.getItem("ajc_whiteboardData");
      if (whiteboardData) {
        const data = JSON.parse(whiteboardData);
        const foundReport = data.interviewReports?.find((r: InterviewReport) => r.id === id);
        if (foundReport) {
          setReport(foundReport);
          return;
        }
      }
    } catch (error) {
      console.error("读取面试报告数据失败:", error);
    }

    // 如果没有找到，使用模拟数据
    setReport({
      id,
      round: "第一轮：技术面试",
      overallScore: 85,
      questions: [
        {
          question: "请介绍一下你自己",
          userAnswer: "我是...",
          aiFeedback: "回答清晰，但可以更突出核心技能",
          score: 80,
        },
      ],
      strengths: ["表达清晰", "逻辑完整"],
      improvements: ["可以增加更多具体案例"],
    });
  }, [id]);

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span>←</span>
            <span>返回</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">面试报告</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="container mx-auto px-6 py-6 max-w-4xl">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{report.round}</h2>
            {report.overallScore !== undefined && (
              <div className="text-right">
                <div className="text-sm text-gray-500">总分</div>
                <div className="text-3xl font-bold text-orange-600">{report.overallScore}</div>
              </div>
            )}
          </div>

          {/* 问题列表 */}
          {report.questions && report.questions.length > 0 && (
            <div className="space-y-6 mb-6">
              {report.questions.map((q, idx) => (
                <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="text-sm font-semibold text-gray-700 mb-2">
                    Q{idx + 1}: {q.question}
                  </div>
                  {q.userAnswer && (
                    <div className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">回答：</span>
                      {q.userAnswer}
                    </div>
                  )}
                  {q.aiFeedback && (
                    <div className="text-sm text-blue-700 mb-2">
                      <span className="font-medium">反馈：</span>
                      {q.aiFeedback}
                    </div>
                  )}
                  {q.score !== undefined && (
                    <div className="text-xs text-gray-500">
                      评分：<span className="font-semibold">{q.score}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 优点和改进建议 */}
          <div className="grid grid-cols-2 gap-4">
            {report.strengths && report.strengths.length > 0 && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-sm font-semibold text-green-900 mb-2">优点</div>
                <ul className="space-y-1">
                  {report.strengths.map((s, idx) => (
                    <li key={idx} className="text-sm text-green-800 flex items-start gap-1">
                      <span>✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.improvements && report.improvements.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm font-semibold text-blue-900 mb-2">改进建议</div>
                <ul className="space-y-1">
                  {report.improvements.map((i, idx) => (
                    <li key={idx} className="text-sm text-blue-800 flex items-start gap-1">
                      <span>→</span>
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

