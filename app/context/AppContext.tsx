"use client";

import React, { createContext, useContext, useReducer, useEffect, useState, type ReactNode } from "react";
import { UserStage, StageNames } from "@/lib/stage";
import { WhiteboardData } from "@/components/Whiteboard";
import { conversationStore, ConversationMessage } from "@/lib/conversationStore";

// 消息类型
export type Message = {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: number;
};

// 用户信息类型
export type User = {
  id: string;
  name: string;
  type?: string;
};

// 面试状态类型
export type InterviewRoundType = "业务面" | "技术面" | "HR面" | "主管面";
export type InterviewState = {
  active: boolean;
  questionIndex: number;
  status: "question" | "answering" | "analysis" | "setup";
  currentAnswer: string;
  currentQuestion?: {
    id: string;
    q: string;
    tips: {
      intent: string; // 考察意图
      keyPoints: string[]; // 需要关注点
      framework: string; // 回答框架
      industryNotes?: string; // 行业特性
      pitfalls?: string[]; // 需要避免
      proTips?: string[]; // 内行窍门
    };
  };
  roundType?: InterviewRoundType;
  questionCount?: number; // 题数设置（AI 或用户选择）
  questionCountMode?: "ai" | "user"; // 题数设置模式
  questions?: Array<{
    id: string;
    q: string;
    tips: any;
  }>;
  evaluations?: Array<{
    questionId: string;
    accuracy: number; // 准确性 0-100
    grammar: number; // 语法 0-100
    detail?: number; // 细节 0-100 (可选)
    confidence: number; // 自信 0-100
    tips: string; // 改进建议
  }>;
  currentEvaluation?: {
    questionId: string;
    accuracy: number;
    grammar: number;
    detail?: number;
    confidence: number;
    tips: string;
  };
};

// 应用状态类型
export type AppState = {
  user: User | null;
  view: "login" | "onboarding" | "main";
  currentStage: UserStage;
  // 当前阶段的对话历史（从 conversationStore 获取）
  currentStageHistory: ConversationMessage[];
  whiteboard: {
    planning: { targetRole: string; keySkills: string; industry: string };
    projects: any[];
    resume: { original: string; optimized: string; rawText?: string; resumeId?: string };
    resumeInsights?: {
      personalInfo?: any;
      education?: any[];
      workExperience?: any[];
      projects?: any[];
      skills?: string[];
      certifications?: string[];
      languages?: string[];
      rawText?: string;
    };
    strategy: { platforms: string[]; priority: string };
    interview: any[];
    interviewReports?: Array<{
      id: string;
      round: InterviewRoundType;
      questionCount: number;
      questions?: Array<{
        question: string;
        userAnswer?: string;
        evaluation?: {
          accuracy: number;
          grammar: number;
          detail?: number;
          confidence: number;
          tips: string;
        };
      }>;
      overallScore?: {
        accuracy: number;
        grammar: number;
        detail?: number;
        confidence: number;
      };
      strengths?: string[];
      improvements?: string[];
      suggestions?: string[];
      createdAt?: string;
    }>;
    notes: string;
  };
  interviewState: InterviewState;
  chatSessionId: string | null;
  isLoading: boolean;
};

// Action 类型
export type AppAction =
  | { type: "SET_USER"; payload: User }
  | { type: "COMPLETE_ONBOARDING"; payload?: UserStage }
  | { type: "SWITCH_STAGE"; payload: UserStage }
  | { type: "ADD_MESSAGE"; payload: ConversationMessage }
  | { type: "LOAD_STAGE_HISTORY"; payload: { stage: UserStage; messages: ConversationMessage[] } }
  | { type: "UPDATE_WHITEBOARD"; payload: { section: string; data: any } }
  | { type: "UPDATE_RESUME_INSIGHTS"; payload: { resumeInsights: any; rawText?: string } }
  | { type: "UPDATE_INTERVIEW_STATE"; payload: Partial<InterviewState> }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_CHAT_SESSION_ID"; payload: string | null }
  | { type: "LOGOUT" }
  | { type: "MERGE_WHITEBOARD_DATA"; payload: WhiteboardData }
  | { type: "ADD_INTERVIEW_REPORT"; payload: any };

// 初始状态（完全一致，不依赖 localStorage，避免 SSR 水合错误）
const initialState: AppState = {
  user: null,
  view: "login",
  currentStage: "career_planning",
  currentStageHistory: [],
  whiteboard: {
    planning: { targetRole: "待定", keySkills: "待挖掘", industry: "互联网/科技" },
    projects: [],
    resume: { original: "", optimized: "", rawText: "", resumeId: "" },
    resumeInsights: undefined,
    strategy: { platforms: ["Boss直聘", "LinkedIn"], priority: "B轮以上互联网公司" },
    interview: [],
    interviewReports: [],
    notes: "",
  },
  interviewState: {
    active: false,
    questionIndex: 0,
    status: "setup",
    currentAnswer: "",
  },
  chatSessionId: null,
  isLoading: false,
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  const newState = { ...state };

  switch (action.type) {
    case "SET_USER":
      newState.user = action.payload;
      // 设置对话存储的用户ID
      conversationStore.setUserId(action.payload.id);
      // 加载该用户的对话历史
      const userHistory = conversationStore.getStageHistory(newState.currentStage);
      newState.currentStageHistory = userHistory;
      // 如果当前阶段没有对话，初始化欢迎消息
      if (userHistory.length === 0) {
        conversationStore.initializeWelcomeMessage(newState.currentStage);
        const welcomeMsg = conversationStore.getStageHistory(newState.currentStage)[0];
        if (welcomeMsg) {
          newState.currentStageHistory = [welcomeMsg];
        }
      }
      newState.view = "onboarding";
      if (typeof window !== "undefined") {
        // 保存用户ID（用于刷新后恢复）
        localStorage.setItem("ai_job_coach_current_user_id", action.payload.id);
        localStorage.setItem(`ai_job_coach_user_${action.payload.id}`, JSON.stringify(action.payload));
      }
      return newState;

    case "COMPLETE_ONBOARDING":
      newState.view = "main";
      if (action.payload) {
        newState.currentStage = action.payload;
      }
      return newState;

    case "SWITCH_STAGE":
      newState.currentStage = action.payload;
      // 保存当前阶段（用于刷新后恢复）
      if (typeof window !== "undefined" && newState.user?.id) {
        localStorage.setItem(`ai_job_coach_current_stage_${newState.user.id}`, JSON.stringify(action.payload));
      }
      // 加载新阶段的对话历史
      const stageHistory = conversationStore.getStageHistory(action.payload);
      newState.currentStageHistory = stageHistory;
      // 如果新阶段没有对话，初始化欢迎消息
      if (stageHistory.length === 0) {
        conversationStore.initializeWelcomeMessage(action.payload);
        const welcomeMsg = conversationStore.getStageHistory(action.payload)[0];
        if (welcomeMsg) {
          newState.currentStageHistory = [welcomeMsg];
        }
      }
      // 重置面试状态
      if (action.payload === "interview") {
        newState.interviewState = { ...initialState.interviewState, active: false };
      } else {
        newState.interviewState = { ...initialState.interviewState, active: false };
      }
      return newState;

    case "ADD_MESSAGE":
      // 添加消息到 conversationStore
      conversationStore.addMessage(action.payload.stage, action.payload);
      // 更新当前阶段的对话历史
      if (action.payload.stage === newState.currentStage) {
        newState.currentStageHistory = conversationStore.getStageHistory(action.payload.stage);
      }
      return newState;

    case "LOAD_STAGE_HISTORY":
      if (action.payload.stage === newState.currentStage) {
        newState.currentStageHistory = action.payload.messages;
      }
      return newState;

    case "UPDATE_WHITEBOARD":
      const { section, data } = action.payload;
      if (section === "projects") {
        newState.whiteboard.projects = [...newState.whiteboard.projects, data];
      } else if (section === "notes") {
        newState.whiteboard.notes = typeof data === "string" ? data : data.content || "";
      } else {
        newState.whiteboard[section as keyof typeof newState.whiteboard] = {
          ...(newState.whiteboard[section as keyof typeof newState.whiteboard] as any),
          ...data,
        };
      }
      if (typeof window !== "undefined" && newState.user?.id) {
        localStorage.setItem(`ai_job_coach_whiteboard_${newState.user.id}`, JSON.stringify(newState.whiteboard));
      }
      return newState;

    case "UPDATE_RESUME_INSIGHTS":
      newState.whiteboard.resumeInsights = action.payload.resumeInsights;
      if (action.payload.rawText) {
        newState.whiteboard.resume.rawText = action.payload.rawText;
        newState.whiteboard.resume.resumeId = `resume_${Date.now()}`;
      }
      if (typeof window !== "undefined" && newState.user?.id) {
        localStorage.setItem(`ai_job_coach_whiteboard_${newState.user.id}`, JSON.stringify(newState.whiteboard));
      }
      return newState;

    case "ADD_INTERVIEW_REPORT":
      if (!newState.whiteboard.interviewReports) {
        newState.whiteboard.interviewReports = [];
      }
      newState.whiteboard.interviewReports.push(action.payload);
      if (typeof window !== "undefined" && newState.user?.id) {
        localStorage.setItem(`ai_job_coach_whiteboard_${newState.user.id}`, JSON.stringify(newState.whiteboard));
      }
      return newState;

    case "UPDATE_INTERVIEW_STATE":
      newState.interviewState = { ...newState.interviewState, ...action.payload };
      return newState;

    case "SET_LOADING":
      newState.isLoading = action.payload;
      return newState;

    case "SET_CHAT_SESSION_ID":
      newState.chatSessionId = action.payload;
      return newState;

    case "MERGE_WHITEBOARD_DATA":
      // 合并从API返回的白板数据
      if (action.payload.intentRole) {
        newState.whiteboard.planning.targetRole = action.payload.intentRole;
      }
      if (action.payload.keySkills) {
        newState.whiteboard.planning.keySkills = Array.isArray(action.payload.keySkills)
          ? action.payload.keySkills.join(", ")
          : action.payload.keySkills;
      }
      if (action.payload.starProjects) {
        newState.whiteboard.projects = action.payload.starProjects.map((p: any) => ({
          name: p.title || "项目",
          star: `${p.situation || ""}\n${p.task || ""}\n${p.action || ""}\n${p.result || ""}`,
        }));
      }
      if (action.payload.interviewReports) {
        newState.whiteboard.interview = action.payload.interviewReports;
      }
      if (typeof window !== "undefined" && newState.user?.id) {
        localStorage.setItem(`ai_job_coach_whiteboard_${newState.user.id}`, JSON.stringify(newState.whiteboard));
      }
      return newState;

    case "LOGOUT":
      // 清空当前用户的对话历史
      if (state.user?.id) {
        conversationStore.clearUserData(state.user.id);
        conversationStore.setUserId(null);
      }
      if (typeof window !== "undefined") {
        // 移除当前用户ID标记
        localStorage.removeItem("ai_job_coach_current_user_id");
        // 注意：不删除用户数据，保留历史记录（如果需要完全删除，可以添加删除逻辑）
      }
      return { ...initialState, user: null, view: "login" };

    default:
      return state;
  }
}

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isHydrated, setIsHydrated] = useState(false);

  // 客户端挂载后，从 localStorage 恢复状态（避免 SSR 水合错误）
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        // 首先尝试恢复用户ID
        const savedUserId = localStorage.getItem("ai_job_coach_current_user_id");
        
        if (savedUserId) {
          // 恢复用户信息
          const savedUser = localStorage.getItem(`ai_job_coach_user_${savedUserId}`);
          if (savedUser) {
            const user = JSON.parse(savedUser);
            if (user && state.user === null) {
              // 设置对话存储的用户ID并加载对话历史
              conversationStore.setUserId(user.id);
              
              // 恢复用户状态（这会触发 SET_USER，加载对话历史）
              dispatch({ type: "SET_USER", payload: user });
              
              // 恢复白板数据
              const savedWhiteboard = localStorage.getItem(`ai_job_coach_whiteboard_${user.id}`);
              if (savedWhiteboard) {
                try {
                  const whiteboard = JSON.parse(savedWhiteboard);
                  // 恢复完整的白板数据（逐个恢复各个部分）
                  if (whiteboard.planning) {
                    dispatch({
                      type: "UPDATE_WHITEBOARD",
                      payload: { section: "planning", data: whiteboard.planning },
                    });
                  }
                  if (whiteboard.projects && Array.isArray(whiteboard.projects)) {
                    whiteboard.projects.forEach((project: any) => {
                      dispatch({
                        type: "UPDATE_WHITEBOARD",
                        payload: { section: "projects", data: project },
                      });
                    });
                  }
                  if (whiteboard.resumeInsights) {
                    dispatch({
                      type: "UPDATE_RESUME_INSIGHTS",
                      payload: { resumeInsights: whiteboard.resumeInsights, rawText: whiteboard.resume?.rawText },
                    });
                  }
                  if (whiteboard.interviewReports && Array.isArray(whiteboard.interviewReports)) {
                    // 逐个恢复面试报告
                    whiteboard.interviewReports.forEach((report: any) => {
                      dispatch({
                        type: "ADD_INTERVIEW_REPORT",
                        payload: report,
                      });
                    });
                  }
                } catch (e) {
                  console.error("恢复白板数据失败:", e);
                }
              }
              
              // 恢复当前阶段（如果之前有保存）
              const savedStage = localStorage.getItem(`ai_job_coach_current_stage_${user.id}`);
              if (savedStage) {
                try {
                  const stage = JSON.parse(savedStage) as UserStage;
                  dispatch({ type: "SWITCH_STAGE", payload: stage });
                } catch (e) {
                  // 忽略解析错误
                }
              }
              
              // 直接切换到主界面（跳过 onboarding，因为用户已经完成过）
              setTimeout(() => {
                dispatch({ type: "COMPLETE_ONBOARDING", payload: state.currentStage });
              }, 100);
            }
          }
        }
      } catch (e) {
        console.error("恢复用户状态失败:", e);
      }
      setIsHydrated(true);
    }
  }, []); // 只在挂载时运行一次

  // 初始化聊天会话
  useEffect(() => {
    if (isHydrated && state.view === "main" && !state.chatSessionId && state.currentStageHistory.length > 0) {
      // 延迟初始化会话，避免重复调用
      const timer = setTimeout(() => {
        // 会话初始化将在聊天面板中处理
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isHydrated, state.view, state.chatSessionId]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}

