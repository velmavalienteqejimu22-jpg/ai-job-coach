"use client";

import { useState } from "react";

export interface ProgressStage {
  id: number;
  name: string;
  icon: string;
  stage: string;
}

interface ProgressSelectorProps {
  stages: ProgressStage[];
  selectedStage: string;
  onStageChange: (stage: string) => void;
}

export default function ProgressSelector({
  stages,
  selectedStage,
  onStageChange,
}: ProgressSelectorProps) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-3">
        当前阶段
      </label>
      <div className="space-y-2">
        {stages.map((stage) => (
          <label
            key={stage.id}
            className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
              selectedStage === stage.stage
                ? "border-cyan-500 bg-cyan-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="progress-stage"
              value={stage.stage}
              checked={selectedStage === stage.stage}
              onChange={(e) => onStageChange(e.target.value)}
              className="w-4 h-4 text-cyan-600 focus:ring-cyan-500 focus:ring-2"
            />
            <span className="ml-3 text-lg">{stage.icon}</span>
            <span className="ml-2 text-sm font-medium text-gray-900">
              {stage.name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

