"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ResumeDiff from "@/components/ResumeDiff";
import { WhiteboardData } from "@/components/Whiteboard";

type ResumeInsight = NonNullable<WhiteboardData["resumeInsights"]>[0];

export default function ResumeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [insight, setInsight] = useState<ResumeInsight | null>(null);
  const [allInsights, setAllInsights] = useState<WhiteboardData["resumeInsights"]>([]);

  useEffect(() => {
    // 从 localStorage 获取白板数据
    try {
      const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
      if (whiteboardDataStr) {
        const whiteboardData: WhiteboardData = JSON.parse(whiteboardDataStr);
        
        // 如果指定了 id，查找对应的 insight
        if (id && whiteboardData.resumeInsights) {
          const foundInsight = whiteboardData.resumeInsights.find((i) => i.id === id);
          if (foundInsight) {
            setInsight(foundInsight);
            setAllInsights([foundInsight]);
            return;
          }
        }
        
        // 如果没有指定 id 或找不到，显示所有 insights
        if (whiteboardData.resumeInsights && whiteboardData.resumeInsights.length > 0) {
          setAllInsights(whiteboardData.resumeInsights);
          return;
        }
      }
    } catch (error) {
      console.error("读取简历数据失败:", error);
    }

    // 如果没有找到，使用模拟数据
    const mockInsight: ResumeInsight = {
      id: id || "mock_1",
      original: "负责前端开发",
      optimized: "独立负责前端架构设计，使用 React 和 TypeScript 构建高性能单页应用",
      suggestion: "原句过于简单，优化后突出了技术栈、职责范围和成果",
      section: "工作经历",
    };
    setInsight(mockInsight);
    setAllInsights([mockInsight]);
  }, [id]);

  const handleDownload = () => {
    // 生成优化后的简历文本
    const optimizedText = allInsights
      .map((insight) => insight.optimized || insight.original)
      .join("\n\n");

    // 创建 blob 并下载
    const blob = new Blob([optimizedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "优化后的简历.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = () => {
    if (!insight) return;
    
    // 从 localStorage 中删除对应的 insight
    try {
      const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
      if (whiteboardDataStr) {
        const whiteboardData: WhiteboardData = JSON.parse(whiteboardDataStr);
        if (whiteboardData.resumeInsights) {
          whiteboardData.resumeInsights = whiteboardData.resumeInsights.filter(
            (i) => i.id !== insight.id
          );
          localStorage.setItem("ajc_whiteboardData", JSON.stringify(whiteboardData));
        }
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
    
    router.push("/chat");
  };

  const displayInsights = insight ? [insight] : allInsights;

  return (
    <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mt-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">简历优化建议</h1>

          {/* 多个句子堆叠展示 */}
          <div className="space-y-6 mb-8">
            {displayInsights.map((item) => (
              <ResumeDiff
                key={item.id}
                original={item.original || ""}
                optimized={item.optimized || ""}
                suggestion={item.suggestion}
                section={item.section}
              />
            ))}
          </div>

          {/* 底部按钮 */}
          <div className="pt-6 border-t border-gray-200 flex gap-3">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              下载优化简历
            </button>
            {insight && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
                删除
              </button>
            )}
            <button
              onClick={() => router.push("/chat")}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              返回
            </button>
          </div>
        </div>
      </div>
  );
}

