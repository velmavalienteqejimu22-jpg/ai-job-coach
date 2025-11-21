"use client";

import { useState, useCallback, useRef, useMemo } from "react";

export type Stage = "career" | "project" | "resume" | "apply" | "interview" | "offer";

export const STAGE_NAMES: Record<Stage, string> = {
  career: "职业规划",
  project: "项目梳理",
  resume: "简历优化",
  apply: "投递策略",
  interview: "面试辅导",
  offer: "Offer",
};

export const STAGE_ORDER: Stage[] = ["career", "project", "resume", "apply", "interview", "offer"];

// 导出 STAGE_NAMES 供外部使用

interface StageFSM {
  current: Stage;
  history: Stage[];
  transition: (stage: Stage | string) => boolean;
  back: () => boolean;
  getCurrent: () => Stage;
  getCurrentName: () => string;
  canGoBack: () => boolean;
}

export function useStageFSM(initialStage: Stage = "career"): StageFSM {
  const [current, setCurrent] = useState<Stage>(initialStage);
  const historyRef = useRef<Stage[]>([initialStage]);

  const transition = useCallback((stage: Stage | string): boolean => {
    // 将字符串转换为 Stage 类型
    let targetStage: Stage;
    
    // 处理 API 返回的 stage 字符串映射
    const stageMap: Record<string, Stage> = {
      planning: "career",
      career: "career",
      project: "project",
      resume: "resume",
      apply: "apply",
      interview: "interview",
      salary: "offer",
      offer: "offer",
    };

    if (typeof stage === "string") {
      targetStage = stageMap[stage.toLowerCase()] || (stage as Stage);
    } else {
      targetStage = stage;
    }

    // 验证是否为有效状态
    if (!STAGE_ORDER.includes(targetStage)) {
      console.warn(`无效的阶段: ${stage}, 映射为: ${targetStage}`);
      return false;
    }

    // 如果目标阶段与当前相同，不执行转换
    if (targetStage === current) {
      return false;
    }

    // 执行状态转换
    const previousStage = current;
    
    // 允许前进或后退到任意阶段
    setCurrent(targetStage);
    
    // 更新历史记录（避免重复）
    if (historyRef.current[historyRef.current.length - 1] !== targetStage) {
      historyRef.current.push(targetStage);
      // 限制历史记录长度
      if (historyRef.current.length > 10) {
        historyRef.current = historyRef.current.slice(-10);
      }
    }

    console.log(`状态转换: ${STAGE_NAMES[previousStage]} -> ${STAGE_NAMES[targetStage]}`);
    return true;
  }, [current]);

  const back = useCallback((): boolean => {
    if (historyRef.current.length <= 1) {
      return false;
    }

    const previousStage = current;
    // 移除当前状态
    historyRef.current.pop();
    const targetStage = historyRef.current[historyRef.current.length - 1];
    
    setCurrent(targetStage);
    console.log(`返回上一步: ${STAGE_NAMES[previousStage]} -> ${STAGE_NAMES[targetStage]}`);
    return true;
  }, [current]);

  const getCurrent = useCallback((): Stage => {
    return current;
  }, [current]);

  const getCurrentName = useCallback((): string => {
    return STAGE_NAMES[current];
  }, [current]);

  const canGoBack = useCallback((): boolean => {
    return historyRef.current.length > 1;
  }, []);

  // 使用 useMemo 稳定返回对象的引用，避免不必要的重新渲染
  return useMemo(() => ({
    current,
    history: [...historyRef.current],
    transition,
    back,
    getCurrent,
    getCurrentName,
    canGoBack,
  }), [current, transition, back, getCurrent, getCurrentName, canGoBack]);
}

