"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import LoadingDots from "./LoadingDots";
import ResumeEditorThumbnail from "./ResumeEditorThumbnail";

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatFlowProps {
  messages: Message[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: (files?: File[]) => void;
  isLoading?: boolean;
  hideInputBar?: boolean; // 新增：是否隐藏输入框
}

export default function ChatFlow({
  messages,
  inputValue,
  onInputChange,
  onSend,
  isLoading = false,
  hideInputBar = false,
}: ChatFlowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <div className="text-4xl mb-4">💬</div>
              <div className="text-gray-500 text-sm">聊天消息将显示在这里</div>
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg) => {
              // 如果是简历编辑器缩略框，渲染特殊组件
              if (msg.content === "RESUME_EDITOR_THUMBNAIL") {
                return <ResumeEditorThumbnail key={msg.id} />;
              }
              
              return (
                <MessageBubble
                  key={msg.id}
                  content={msg.content}
                  isUser={msg.isUser}
                  timestamp={msg.timestamp}
                />
              );
            })}
            {/* AI Loading 占位 */}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm">AI</span>
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <LoadingDots />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入区域（如果 hideInputBar 为 true 则不显示） */}
      {!hideInputBar && (
        <InputBar
          value={inputValue}
          onChange={onInputChange}
          onSend={onSend}
          isLoading={isLoading}
          disabled={isLoading}
        />
      )}
    </div>
  );
}

