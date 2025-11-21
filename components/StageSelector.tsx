"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserStage, StageOrder, StageNames, StageDescriptions } from "@/lib/stage";

interface StageSelectorProps {
  onSelectStage: (stage: UserStage) => void;
  currentStage?: UserStage;
  className?: string;
  onCancel?: () => void;
}

export default function StageSelector({ onSelectStage, currentStage, className, onCancel }: StageSelectorProps) {
  const router = useRouter();
  const [completedStages, setCompletedStages] = useState<Set<UserStage>>(new Set());

  useEffect(() => {
    try {
      const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      const completed = new Set<UserStage>();

      if (whiteboardDataStr) {
        const whiteboardData = JSON.parse(whiteboardDataStr);
        if (whiteboardData.intentRole || whiteboardData.keySkills?.length > 0) completed.add("career_planning");
        if (whiteboardData.starProjects?.length > 0) completed.add("project_review");
        if (whiteboardData.resumeInsights?.length > 0) completed.add("resume_optimization");
        if (whiteboardData.targetCompanies?.length > 0) completed.add("application_strategy");
        if (whiteboardData.interviewReports?.length > 0) completed.add("interview");
        if (whiteboardData.salaryStrategy) completed.add("salary_talk");
        if (whiteboardData.offers?.length > 0) completed.add("offer");
      }

      if (chatHistoryStr) {
        const chatHistory = JSON.parse(chatHistoryStr);
        Object.keys(chatHistory).forEach((stage) => {
          if (chatHistory[stage]?.length > 0 && StageOrder.includes(stage as UserStage)) {
            completed.add(stage as UserStage);
          }
        });
      }

      setCompletedStages(completed);
    } catch (error) {
      console.error("读取已完成阶段失败:", error);
    }
  }, []);

  const getStageStatus = (stage: UserStage) => {
    if (currentStage === stage) return "current";
    if (completedStages.has(stage)) return "completed";
    return "pending";
  };

  const getStageIcon = (stage: UserStage) => {
    const icons: Record<UserStage, string> = {
      career_planning: "🎯",
      project_review: "📋",
      resume_optimization: "📝",
      application_strategy: "📤",
      interview: "💼",
      salary_talk: "💰",
      offer: "🎉",
    };
    return icons[stage] || "📌";
  };
  
  // 只显示用户需要的阶段
  const visibleStages: UserStage[] = [
    "career_planning",
    "project_review",
    "resume_optimization",
    "interview",
    "salary_talk",
  ];

  const handleBack = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push("/chat");
    }
  };

  return (
    <div className={`h-full w-full bg-neutral-50 p-6 overflow-y-auto ${className ?? ""}`}>
      <div className="max-w-4xl mx-auto h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">求职流程</h1>
          <p className="text-sm text-gray-600">选择你想要进入的阶段，继续你的求职之旅</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleStages.map((stage, index) => {
            const status = getStageStatus(stage);
            const isCompleted = status === "completed";
            const isCurrent = status === "current";

            return (
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onSelectStage(stage)}
                className={`relative p-6 rounded-lg border-2 cursor-pointer transition-all ${
                  isCurrent
                    ? "border-blue-500 bg-blue-50 shadow-lg"
                    : isCompleted
                    ? "border-green-500 bg-green-50 hover:border-green-600 hover:shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                }`}
              >
                {isCompleted && (
                  <div className="absolute top-4 right-4">
                    <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute top-4 right-4">
                    <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">→</span>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="text-3xl">{getStageIcon(stage)}</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{StageNames[stage]}</h3>
                    <p className="text-sm text-gray-600 mb-3">{StageDescriptions[stage]}</p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          isCurrent
                            ? "bg-blue-100 text-blue-700"
                            : isCompleted
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {isCurrent ? "当前阶段" : isCompleted ? "已完成" : "待开始"}
                      </span>
                      <span className="text-xs text-gray-400">步骤 {index + 1} / {StageOrder.length}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={handleBack}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← 返回
          </button>
        </div>
      </div>
    </div>
  );
}

