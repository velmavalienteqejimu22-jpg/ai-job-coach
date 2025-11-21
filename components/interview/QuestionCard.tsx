/**
 * 问题卡片组件
 * 显示当前面试问题
 */

"use client";

import { motion } from "framer-motion";
import { InterviewQuestion } from "@/store/interviewStore";

interface QuestionCardProps {
  question: InterviewQuestion;
  questionNumber: number; // 当前题号（从1开始）
  totalQuestions: number; // 总题数
}

export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
}: QuestionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-4"
    >
      {/* 题号标识 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold rounded-full">
            Q{questionNumber}/{totalQuestions}
          </span>
          <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
            {question.status === "pending" && "待回答"}
            {question.status === "answered" && "已回答"}
            {question.status === "evaluated" && "已评估"}
          </span>
        </div>
      </div>

      {/* 问题内容 */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">问题：</h3>
        <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
          {question.q}
        </p>
      </div>

      {/* 用户回答（如果有） */}
      {question.userAnswer && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">你的回答：</h4>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {question.userAnswer}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}



