"use client";

interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  timestamp?: Date;
}

export default function MessageBubble({ content, isUser, timestamp }: MessageBubbleProps) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`flex items-start gap-3 max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* AI 头像 */}
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm">AI</span>
          </div>
        )}
        
        {/* 消息气泡 */}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
              : "bg-gray-100 text-gray-900"
          }`}
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
          {timestamp && (
            <div className={`text-xs mt-1 ${isUser ? "text-cyan-100" : "text-gray-500"}`}>
              {timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>

        {/* 用户头像 */}
        {isUser && (
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
            <span className="text-gray-600 text-sm">我</span>
          </div>
        )}
      </div>
    </div>
  );
}

