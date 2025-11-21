"use client";

import { useApp } from "../context/AppContext";
import { LayoutTemplate } from "./icons";
import InterviewStage from "./InterviewStage";
import ResumeStage from "./ResumeStage";

export default function CenterStage() {
  const { state } = useApp();
  const { currentStage } = state;

  // 根据阶段渲染不同的组件
  if (currentStage === "interview") {
    return <InterviewStage />;
  }

  if (currentStage === "resume_optimization") {
    return <ResumeStage />;
  }

  // 默认空状态
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-300 bg-slate-50/30">
      <LayoutTemplate size={64} className="mb-4 opacity-50" />
      <p>请在左侧选择功能或继续对话</p>
    </div>
  );
}
