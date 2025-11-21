"use client";

import { useApp } from "../context/AppContext";
import ChatSidebar from "./ChatSidebar";
import CenterStage from "./CenterStage";
import WhiteboardPanel from "./WhiteboardPanel";

export default function MainLayout() {
  const { state } = useApp();

  // 动态计算宽度：
  // 如果是面试阶段：Interview 60% | Whiteboard 40% (不显示对话)
  // 如果是简历阶段：Chat 25% | Center 50% | Whiteboard 25%
  // 否则: Chat 60% | Whiteboard 40%
  const isInterviewStage = state.currentStage === "interview";
  const hasCenterContent = ["interview", "resume_optimization"].includes(state.currentStage);

  return (
    <div className="flex h-screen w-full bg-slate-50 flex-col md:flex-row">
      {/* 左侧：对话 (面试阶段不显示) */}
      {!isInterviewStage && (
        <div
          className={`${
            hasCenterContent ? "w-1/4" : "flex-[6]"
          } min-w-0 transition-all duration-300 ease-in-out border-r border-slate-200 flex flex-col overflow-hidden`}
        >
          <ChatSidebar />
        </div>
      )}

      {/* 中间：动态区 */}
      {hasCenterContent && (
        <div
          className={`${
            isInterviewStage ? "flex-[6]" : "flex-1"
          } min-w-0 transition-all duration-300 ease-in-out flex flex-col overflow-hidden`}
        >
          <CenterStage />
        </div>
      )}

      {/* 右侧：白板 (始终存在) */}
      <div
        className={`${
          isInterviewStage ? "flex-[4]" : hasCenterContent ? "w-1/4" : "flex-[4]"
        } min-w-0 transition-all duration-300 ease-in-out flex flex-col overflow-hidden`}
      >
        <WhiteboardPanel />
      </div>
    </div>
  );
}

