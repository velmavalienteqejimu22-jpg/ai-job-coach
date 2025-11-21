"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResumeDiffViewProps {
  id: string;
  original: string;
  optimized: string;
  onAccept?: () => void;
  onEdit?: (edited: string) => void;
}

export default function ResumeDiffView({
  id,
  original,
  optimized,
  onAccept,
  onEdit,
}: ResumeDiffViewProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(optimized);

  // 简单的差异高亮（使用 <mark> 标签模拟）
  const highlightDiff = (text: string, compareText: string) => {
    // 简单的实现：标记新增或修改的部分
    // 实际应用中可以使用更复杂的 diff 算法
    const words = text.split(/(\s+)/);
    const compareWords = compareText.split(/(\s+)/);
    
    return words.map((word, index) => {
      if (word.trim() && !compareWords.includes(word)) {
        return <mark key={index} className="bg-yellow-200">{word}</mark>;
      }
      return <span key={index}>{word}</span>;
    });
  };

  const handleDownload = () => {
    const content = isEditing ? editedText : optimized;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-optimized-${id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAccept = () => {
    if (onAccept) {
      onAccept();
    }
    router.back();
  };

  const handleSaveEdit = () => {
    if (onEdit) {
      onEdit(editedText);
    }
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span>←</span>
            <span>返回</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">简历优化对比</h1>
          <div className="w-20"></div> {/* 占位，保持居中 */}
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-2 gap-6 h-[calc(100vh-180px)]">
          {/* 左侧：原始文本 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">原始文本</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
                {original}
              </pre>
            </div>
          </div>

          {/* 右侧：优化文本 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-cyan-50">
              <h2 className="text-sm font-semibold text-gray-700">优化文本</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isEditing ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full h-full p-3 border border-cyan-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none font-mono text-sm"
                  autoFocus
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
                  {highlightDiff(optimized, original)}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setEditedText(optimized);
                  setIsEditing(false);
                }}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-6 py-2 text-sm font-medium text-white bg-cyan-500 rounded-lg hover:bg-cyan-600 transition-colors"
              >
                保存
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAccept}
                className="px-6 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
              >
                接受
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
              >
                编辑
              </button>
              <button
                onClick={handleDownload}
                className="px-6 py-2 text-sm font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
              >
                下载
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

