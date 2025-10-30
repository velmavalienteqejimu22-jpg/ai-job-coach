"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
};

interface ChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  personalTip: string;
  setPersonalTip: React.Dispatch<React.SetStateAction<string>>;
  chatSessionId: string | null;
  setChatSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  onAchieve?: (label: string) => void;
  onSessionReady?: (sessionId: string) => void;
}

export default function ChatPanel({ 
  messages, 
  setMessages, 
  inputValue, 
  setInputValue, 
  isLoading, 
  setIsLoading, 
  personalTip, 
  setPersonalTip, 
  chatSessionId,
  setChatSessionId,
  onAchieve, 
  onSessionReady 
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    // 只有在没有消息且没有 sessionId 时才初始化
    if (messages.length === 0 && !chatSessionId) {
      const initializeChat = async () => {
        try {
          setIsLoading(true);
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
          setChatSessionId(data.sessionId);
          onSessionReady?.(data.sessionId);
          const aiMessage: Message = { id: Date.now().toString(), content: data.reply, isUser: false, timestamp: new Date() };
          setMessages([aiMessage]);
          onAchieve?.("新手入门 🌱");
          if (data.personalizationTip) setPersonalTip(data.personalizationTip);
        } finally {
          setIsLoading(false);
        }
      };
      initializeChat();
    }
  }, [messages.length, chatSessionId, setIsLoading, setMessages, onSessionReady, onAchieve, setPersonalTip, setChatSessionId]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), content: inputValue.trim(), isUser: true, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    try {
      // 获取当前的 onboarding 数据
      let onboarding: any = null;
      try {
        const saved = localStorage.getItem("onboarding");
        if (saved) onboarding = JSON.parse(saved);
      } catch {}
      
      const response = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chatSessionId, message: userMessage.content, onboarding }),
      });
      const data = await response.json();
      const aiMessage: Message = { id: (Date.now() + 1).toString(), content: data.reply, isUser: false, timestamp: new Date() };
      setMessages(prev => [...prev, aiMessage]);
    } catch (e) {
      // noop
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8">
        <div className="bg-[var(--card-bg)] border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[75vh]">
          {personalTip && (
            <div className="px-4 py-2 text-xs text-gray-700 bg-amber-50 border-b border-amber-200">{personalTip}</div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${message.isUser ? "bg-[var(--blue-500)] text-white" : "bg-gray-100 text-gray-800"}`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-2xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-2xl">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder="输入你的消息..." className="flex-1 px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--blue-500)] focus:border-transparent bg-white" disabled={isLoading} />
              <button onClick={sendMessage} disabled={!inputValue.trim() || isLoading} className="px-5 py-3 text-white rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors bg-[var(--blue-500)] hover:bg-[var(--blue-600)]">发送</button>
            </div>
          </div>
        </div>
      </div>
      <div className="lg:col-span-4 space-y-6">
        {/* 右侧信息区可留空，或未来放快捷提示 */}
      </div>
    </div>
  );
}


