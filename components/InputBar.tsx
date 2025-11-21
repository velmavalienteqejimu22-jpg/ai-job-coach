"use client";

import { useState, useRef, ChangeEvent } from "react";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (files?: File[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function InputBar({ value, onChange, onSend, isLoading = false, disabled = false }: InputBarProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<Record<string, "uploading" | "success" | "error">>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const validFiles = Array.from(files).filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        return ext === "pdf" || ext === "docx";
      });

      // 添加新文件
      setUploadedFiles((prev) => [...prev, ...validFiles]);
      
      // 模拟上传成功（实际应该在上传时处理）
      validFiles.forEach((file) => {
        setUploadStatus((prev) => ({ ...prev, [file.name]: "success" }));
      });
    }
    // 重置 input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.name !== fileName));
    setUploadStatus((prev) => {
      const newStatus = { ...prev };
      delete newStatus[fileName];
      return newStatus;
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && (value.trim() || uploadedFiles.length > 0)) {
        onSend(uploadedFiles.length > 0 ? uploadedFiles : undefined);
        // 发送后清空文件列表
        setUploadedFiles([]);
        setUploadStatus({});
      }
    }
  };

  const handleSendClick = () => {
    if (!disabled && !isLoading && (value.trim() || uploadedFiles.length > 0)) {
      onSend(uploadedFiles.length > 0 ? uploadedFiles : undefined);
      // 发送后清空文件列表
      setUploadedFiles([]);
      setUploadStatus({});
    }
  };

  return (
    <div className="w-full">
      {/* 已上传文件列表 */}
      {uploadedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploadedFiles.map((file) => {
            const status = uploadStatus[file.name] || "success";
            // 使用文件名和大小作为唯一 key，避免 hydration 问题
            const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
            return (
              <div
                key={fileKey}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  status === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : status === "uploading"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                <span className="max-w-[150px] truncate">{file.name}</span>
                {status === "success" && (
                  <span className="text-green-600">✓</span>
                )}
                <button
                  onClick={() => handleRemoveFile(file.name)}
                  className="text-gray-500 hover:text-gray-700 ml-1"
                  type="button"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex items-center gap-2">
        {/* 文件上传按钮 */}
        <label className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />
          <svg
            className="w-5 h-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </label>

        {/* 文本输入 */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入消息..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
          disabled={disabled || isLoading}
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSendClick}
          disabled={disabled || isLoading || (!value.trim() && uploadedFiles.length === 0)}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
        >
          发送
        </button>
      </div>
    </div>
  );
}

