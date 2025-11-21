"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import ProgressSelector, { ProgressStage } from "./ProgressSelector";

export interface UserData {
  identity: string;
  currentStage: string;
}

interface RegisterFormProps {
  onSubmit?: (data: UserData) => void;
}

const identityOptions = [
  { value: "应届生", label: "应届生" },
  { value: "实习生", label: "实习生" },
  { value: "社招", label: "社招" },
];

const progressStages: ProgressStage[] = [
  { id: 0, name: "职业规划", icon: "🎯", stage: "职业规划" },
  { id: 1, name: "项目梳理", icon: "📊", stage: "项目梳理" },
  { id: 2, name: "简历优化", icon: "📄", stage: "简历优化" },
  { id: 3, name: "投递策略", icon: "📮", stage: "投递策略" },
  { id: 4, name: "面试辅导", icon: "💬", stage: "面试辅导" },
  { id: 5, name: "谈薪策略", icon: "💰", stage: "谈薪策略" },
];

export default function RegisterForm({ onSubmit }: RegisterFormProps) {
  const router = useRouter();
  const [identity, setIdentity] = useState<string>("");
  const [currentStage, setCurrentStage] = useState<string>("职业规划");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!identity) {
      alert("请选择身份");
      return;
    }

    const userData: UserData = {
      identity,
      currentStage,
    };

    // 保存到 localStorage
    localStorage.setItem("ajc_user", JSON.stringify(userData));

    // 调用可选的回调
    onSubmit?.(userData);

    // 跳转到聊天页面
    router.push("/chat");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
      {/* 身份选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          身份
        </label>
        <div className="space-y-2">
          {identityOptions.map((option) => (
            <label
              key={option.value}
              className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                identity === option.value
                  ? "border-cyan-500 bg-cyan-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="identity"
                value={option.value}
                checked={identity === option.value}
                onChange={(e) => setIdentity(e.target.value)}
                className="w-4 h-4 text-cyan-600 focus:ring-cyan-500 focus:ring-2"
              />
              <span className="ml-3 text-sm font-medium text-gray-900">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 阶段选择 */}
      <ProgressSelector
        stages={progressStages}
        selectedStage={currentStage}
        onStageChange={setCurrentStage}
      />

      {/* 提交按钮 */}
      <button
        type="submit"
        disabled={!identity}
        className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
      >
        开始使用
      </button>
    </form>
  );
}

