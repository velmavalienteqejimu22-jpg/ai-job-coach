"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface AssessmentResult {
  score: number;
  breakdown: {
    accuracy: number;
    completeness: number;
    logic: number;
    communication: number;
  };
  feedback: {
    strengths: string[];
    improvements: string[];
    overall: string;
  };
  tips?: {
    intent: string;
    keypoints: string[];
  };
}

// 模拟面试数据
const MOCK_INTERVIEW_DATA: Record<string, {
  round: string;
  questions: string[];
  tips: {
    intent: string;
    keypoints: string[];
  };
}> = {
  "1": {
    round: "第一轮：技术面试",
    questions: [
      "请做一次项目复盘：目标、你负责的核心工作、关键决策、结果指标，以及复盘反思。",
      "谈谈你对用户洞察的一个案例：如何发现洞察、采用了哪些方法（如访谈/埋点/问卷）、如何影响产品方案？",
      "描述一次数据驱动的决策：你如何定义指标、设计实验或AB、解读结果并落地？",
    ],
    tips: {
      intent: "考察候选人的项目管理和执行能力，以及结果导向思维",
      keypoints: ["项目背景", "个人职责", "关键成果", "数据指标", "复盘反思"],
    },
  },
  "2": {
    round: "第二轮：行为面试",
    questions: [
      "请描述一次你处理复杂问题的经历。",
      "你如何与团队成员协作完成一个项目？",
    ],
    tips: {
      intent: "考察候选人的问题解决能力和团队协作能力",
      keypoints: ["问题分析", "解决方案", "执行过程", "团队配合", "最终结果"],
    },
  },
};

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const round = params.round as string;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [interviewData, setInterviewData] = useState<{
    round: string;
    questions: string[];
    tips: { intent: string; keypoints: string[] };
  } | null>(null);

  useEffect(() => {
    // 从 localStorage 或模拟数据加载
    try {
      const saved = localStorage.getItem(`interview_${round}`);
      if (saved) {
        const data = JSON.parse(saved);
        setInterviewData(data);
        return;
      }
    } catch (error) {
      console.error("读取面试数据失败:", error);
    }

    // 使用模拟数据
    if (MOCK_INTERVIEW_DATA[round]) {
      setInterviewData(MOCK_INTERVIEW_DATA[round]);
    } else {
      // 默认数据
      setInterviewData({
        round: `第 ${round} 轮面试`,
        questions: ["请介绍一下你自己", "为什么选择这个岗位？"],
        tips: {
          intent: "考察候选人的基本素质和岗位匹配度",
          keypoints: ["自我介绍", "岗位理解", "个人优势", "职业规划"],
        },
      });
    }
  }, [round]);

  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting || !interviewData) {
      return;
    }

    setIsSubmitting(true);
    setAssessment(null);

    try {
      const response = await fetch("/api/interview/assess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          round,
          question: interviewData.questions[currentQuestionIndex],
          answer: answer.trim(),
        }),
      });

      const data = await response.json();
      console.log("评估结果:", data);
      setAssessment(data);
    } catch (error) {
      console.error("提交评估失败:", error);
      alert("提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    if (interviewData && currentQuestionIndex < interviewData.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAnswer("");
      setAssessment(null);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setAnswer("");
      setAssessment(null);
    }
  };

  if (!interviewData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const currentQuestion = interviewData.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === interviewData.questions.length - 1;

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
          <h1 className="text-lg font-semibold text-gray-900">{interviewData.round}</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* 左侧：问题列表和回答区域（占 2/3） */}
          <div className="col-span-2 space-y-6">
            {/* 问题列表 */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">问题列表</h2>
                <span className="text-xs text-gray-500">
                  第 {currentQuestionIndex + 1} / {interviewData.questions.length} 题
                </span>
              </div>
              <div className="space-y-2">
                {interviewData.questions.map((q, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      index === currentQuestionIndex
                        ? "bg-cyan-50 border-cyan-300"
                        : "bg-gray-50 border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      setCurrentQuestionIndex(index);
                      setAnswer("");
                      setAssessment(null);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-gray-500 min-w-[24px]">
                        Q{index + 1}
                      </span>
                      <p className="text-sm text-gray-800 flex-1">{q}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 当前问题 */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                当前问题
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed mb-6">
                {currentQuestion}
              </p>

              {/* 回答文本框 */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  你的回答
                </label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="在此输入你的回答..."
                  className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                  disabled={isSubmitting}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {answer.length} 字
                  </span>
                  <button
                    onClick={handleSubmit}
                    disabled={!answer.trim() || isSubmitting}
                    className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? "评估中..." : "提交评估"}
                  </button>
                </div>
              </div>

              {/* 评估结果 */}
              {assessment && (
                <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    评估结果
                  </h4>
                  
                  {/* 总分 */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">总分</span>
                      <span className="text-2xl font-bold text-green-600">
                        {assessment.score}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${assessment.score}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 分项评分 */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-2 bg-white rounded border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">准确性</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {assessment.breakdown.accuracy}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">完整性</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {assessment.breakdown.completeness}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">逻辑性</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {assessment.breakdown.logic}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">表达清晰度</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {assessment.breakdown.communication}
                      </div>
                    </div>
                  </div>

                  {/* 反馈 */}
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">优点</div>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {assessment.feedback.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-green-500">✓</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">改进建议</div>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {assessment.feedback.improvements.map((s, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-blue-500">→</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="pt-2 border-t border-green-200">
                      <div className="text-xs font-medium text-gray-700 mb-1">总体评价</div>
                      <p className="text-xs text-gray-600">{assessment.feedback.overall}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 导航按钮 */}
              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={handlePrevQuestion}
                  disabled={currentQuestionIndex === 0}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一题
                </button>
                <button
                  onClick={handleNextQuestion}
                  disabled={isLastQuestion}
                  className="px-4 py-2 text-sm font-medium text-white bg-cyan-500 rounded-lg hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一题
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：Tips 面板（占 1/3） */}
          <div className="col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sticky top-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">💡 答题 Tips</h3>
              
              {/* 考察意图 */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs font-medium text-blue-900 mb-2">考察意图</div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  {interviewData.tips.intent}
                </p>
              </div>

              {/* 回答要点 */}
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="text-xs font-medium text-purple-900 mb-2">回答要点</div>
                <ul className="text-xs text-purple-800 space-y-1.5">
                  {interviewData.tips.keypoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-1.5">
                      <span className="text-purple-500 mt-0.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 如果评估结果有额外的 tips */}
              {assessment?.tips && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="text-xs font-medium text-yellow-900 mb-2">AI 建议</div>
                  <p className="text-xs text-yellow-800 mb-2">{assessment.tips.intent}</p>
                  <ul className="text-xs text-yellow-800 space-y-1">
                    {assessment.tips.keypoints.map((point, index) => (
                      <li key={index} className="flex items-start gap-1.5">
                        <span className="text-yellow-500 mt-0.5">→</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

