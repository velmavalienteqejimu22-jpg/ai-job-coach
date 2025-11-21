"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { WhiteboardData } from "@/components/Whiteboard";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<WhiteboardData["starProjects"]>[0] | null>(null);

  useEffect(() => {
    // 从 localStorage 获取白板数据
    try {
      const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
      if (whiteboardDataStr) {
        const whiteboardData: WhiteboardData = JSON.parse(whiteboardDataStr);
        const foundProject = whiteboardData.starProjects?.find((p) => p.id === id);
        if (foundProject) {
          setProject(foundProject);
          return;
        }
      }
    } catch (error) {
      console.error("读取项目数据失败:", error);
    }

    // 如果没有找到，使用模拟数据
    setProject({
      id,
      title: "示例项目",
      situation: "项目背景描述...",
      task: "任务和目标...",
      action: "采取的行动...",
      result: "项目成果...",
      createdAt: new Date().toISOString(),
    });
  }, [id]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mt-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">{project.title}</h1>

          {/* STAR 结构 */}
          <div className="space-y-6">
            {project.situation && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                    S
                  </span>
                  Situation（背景）
                </h3>
                <p className="text-gray-700 leading-relaxed pl-10">{project.situation}</p>
              </div>
            )}

            {project.task && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">
                    T
                  </span>
                  Task（任务）
                </h3>
                <p className="text-gray-700 leading-relaxed pl-10">{project.task}</p>
              </div>
            )}

            {project.action && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
                    A
                  </span>
                  Action（行动）
                </h3>
                <p className="text-gray-700 leading-relaxed pl-10">{project.action}</p>
              </div>
            )}

            {project.result && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold">
                    R
                  </span>
                  Result（结果）
                </h3>
                <p className="text-gray-700 leading-relaxed pl-10">{project.result}</p>
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex gap-3">
            <button
              onClick={() => router.push("/chat")}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

