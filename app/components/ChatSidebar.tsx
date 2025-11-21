"use client";

import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { UserStage, StageNames } from "@/lib/stage";
import { conversationStore } from "@/lib/conversationStore";
import { generateMessageId } from "@/lib/utils";
import { ArrowUp, ChevronDown, LogOut, Bot, Activity, Compass, Layers, FileText, Send, Mic, DollarSign, User } from "./icons";

const STAGE_CONFIG: Record<UserStage, { label: string; icon: any }> = {
  career_planning: { label: "职业规划", icon: Compass },
  project_review: { label: "经历复盘", icon: Layers },
  resume_optimization: { label: "简历优化", icon: FileText },
  application_strategy: { label: "投递策略", icon: Send },
  interview: { label: "模拟面试", icon: Mic },
  salary_talk: { label: "谈薪策略", icon: DollarSign },
  offer: { label: "Offer", icon: Activity },
};

export default function ChatSidebar() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showStageMenu, setShowStageMenu] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.currentStageHistory, isTyping]);

  // 初始化聊天会话（仅在首次进入时）
  useEffect(() => {
    if (state.view === "main" && !state.chatSessionId && state.currentStageHistory.length <= 1) {
      initializeChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view]);

  const initializeChat = async () => {
    try {
      setIsTyping(true);
      let onboarding: any = null;
      try {
        const saved = localStorage.getItem("onboarding");
        if (saved) onboarding = JSON.parse(saved);
      } catch {}
      const response = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding }),
      });
      const data = await response.json();
      if (data.sessionId) {
        dispatch({ type: "SET_CHAT_SESSION_ID", payload: data.sessionId });
      }
      if (data.reply) {
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            id: generateMessageId(),
            sender: "ai",
            text: data.reply,
            timestamp: Date.now(),
            stage: state.currentStage,
          },
        });
      }
      if (data.whiteboardData) {
        dispatch({ type: "MERGE_WHITEBOARD_DATA", payload: data.whiteboardData });
      }
    } catch (error) {
      console.error("初始化聊天失败:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = {
      id: generateMessageId(),
      sender: "user" as const,
      text: input.trim(),
      timestamp: Date.now(),
      stage: state.currentStage,
    };
    dispatch({ type: "ADD_MESSAGE", payload: userMsg });
    setInput("");
    setIsTyping(true);

    try {
      // 获取当前的 onboarding 数据
      let onboarding: any = null;
      try {
        const saved = localStorage.getItem("onboarding");
        if (saved) onboarding = JSON.parse(saved);
      } catch {}

      // 获取所有阶段的对话历史（用于AI上下文）
      const allHistory = conversationStore.getAllHistoryForStage(state.currentStage);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.text,
          userStage: state.currentStage,
          allHistory: allHistory,
          sessionId: state.chatSessionId,
          userId: state.user?.id,
        }),
      });

      const data = await response.json();

      if (data.sessionId && !state.chatSessionId) {
        dispatch({ type: "SET_CHAT_SESSION_ID", payload: data.sessionId });
      }

      if (data.reply) {
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            id: generateMessageId(),
            sender: "ai",
            text: data.reply,
            timestamp: Date.now(),
            stage: state.currentStage,
          },
        });
      }

      // 更新白板数据
      if (data.whiteboardData) {
        dispatch({ type: "MERGE_WHITEBOARD_DATA", payload: data.whiteboardData });
      }

      // 如果建议推进阶段
      if (data.shouldAdvance && data.nextStage) {
        // 可以显示提示或自动切换
      }
    } catch (error) {
      console.error("发送消息失败:", error);
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: generateMessageId(),
          sender: "ai",
          text: "抱歉，处理你的请求时出现了错误。请稍后再试。",
          timestamp: Date.now(),
          stage: state.currentStage,
        },
      });
    } finally {
      setIsTyping(false);
    }
  };

  const stages = Object.keys(STAGE_CONFIG) as UserStage[];

  const currentStageConfig = STAGE_CONFIG[state.currentStage] || { label: "未知", icon: Activity };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 relative z-10">
      {/* 顶部导航栏 */}
      <div className="h-14 border-b border-slate-100 flex items-center justify-between px-4 bg-white">
        <div className="flex items-center cursor-pointer" onClick={() => setShowStageMenu(!showStageMenu)}>
          <div className="bg-blue-100 p-1.5 rounded-md mr-2">
            <currentStageConfig.icon size={16} className="text-blue-600" />
          </div>
          <span className="font-semibold text-sm text-slate-700">{currentStageConfig.label}</span>
          <ChevronDown size={14} className="ml-2 text-slate-400" />
        </div>
        <button
          className="text-slate-400 hover:text-slate-600"
          onClick={() => dispatch({ type: "LOGOUT" })}
          title="退出"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* 阶段切换菜单 (Dropdown) */}
      {showStageMenu && (
        <div className="absolute top-14 left-0 w-full bg-white border-b border-slate-200 shadow-lg p-2 grid grid-cols-2 gap-2 z-20 animate-fade-in">
          {stages.map((stageId) => {
            const config = STAGE_CONFIG[stageId];
            const Icon = config.icon;
            return (
              <button
                key={stageId}
                onClick={() => {
                  dispatch({ type: "SWITCH_STAGE", payload: stageId });
                  setShowStageMenu(false);
                }}
                className={`flex items-center p-2 rounded-md text-sm transition ${
                  state.currentStage === stageId
                    ? "bg-blue-50 text-blue-600"
                    : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                <Icon size={16} className="mr-2 opacity-70" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 聊天记录 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {state.currentStageHistory.map((msg, index) => (
          <div key={`${msg.id}-${msg.timestamp}-${index}`} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            {msg.sender === "ai" && (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mr-2 flex-shrink-0 text-white text-xs">
                <Bot size={16} />
              </div>
            )}
            <div
              className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.sender === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-white text-slate-700 border border-slate-100 rounded-bl-none"
              }`}
            >
              {msg.text}
            </div>
            {msg.sender === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center ml-2 flex-shrink-0 text-white text-xs">
                <User size={16} />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mr-2 flex-shrink-0 text-white text-xs">
              <Bot size={16} />
            </div>
            <div className="bg-white p-3 rounded-2xl rounded-bl-none border border-slate-100 flex items-center space-x-1">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-4 bg-white border-t border-slate-200">
        <form onSubmit={handleSend} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的回答..."
            className="w-full pl-4 pr-12 py-3 bg-slate-100 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
          />
          <button
            type="submit"
            className="absolute right-2 top-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
            disabled={!input.trim()}
          >
            <ArrowUp size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

