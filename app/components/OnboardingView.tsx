"use client";

import { useState } from "react";
import { useApp } from "../context/AppContext";
import { User, Target } from "./icons";
import { UserStage } from "@/lib/stage";

const STAGE_OPTIONS: { id: UserStage; label: string; description: string }[] = [
  { id: "career_planning", label: "职业规划", description: "迷茫？不知道干什么" },
  { id: "project_review", label: "项目/经历梳理", description: "挖掘简历亮点" },
  { id: "resume_optimization", label: "简历优化", description: "精修简历措辞" },
  { id: "interview", label: "模拟面试", description: "实战演练" },
];

export default function OnboardingView() {
  const { dispatch } = useApp();
  const [identity, setIdentity] = useState("");

  const startJourney = (stage: UserStage) => {
    dispatch({ type: "COMPLETE_ONBOARDING", payload: stage });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 animate-fade-in">
      <h2 className="text-3xl font-bold text-slate-800 mb-2">欢迎！让我们定制你的计划</h2>
      <p className="text-slate-500 mb-10">选择你当前的身份与最急需解决的问题</p>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* 身份选择 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-lg mb-4 flex items-center">
            <User className="mr-2" size={20} /> 我是...
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {["应届生", "在校生", "社招", "转行"].map((item) => (
              <button
                key={item}
                onClick={() => setIdentity(item)}
                className={`py-2 px-4 rounded-lg text-sm border transition ${
                  identity === item
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* 阶段选择 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-lg mb-4 flex items-center">
            <Target className="mr-2" size={20} /> 我想先解决...
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {STAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => startJourney(option.id)}
                className="text-left p-3 border rounded-lg hover:border-blue-400 hover:shadow-md transition group"
              >
                <div className="font-medium group-hover:text-blue-600">{option.label}</div>
                <div className="text-xs text-slate-400">{option.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

