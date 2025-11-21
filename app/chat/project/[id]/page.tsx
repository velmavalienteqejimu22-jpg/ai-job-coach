"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface StarProject {
  id: string;
  title: string;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  createdAt?: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<StarProject | null>(null);

  useEffect(() => {
    // 从 localStorage 或全局状态获取项目数据
    try {
      const whiteboardData = localStorage.getItem("ajc_whiteboardData");
      if (whiteboardData) {
        const data = JSON.parse(whiteboardData);
        const foundProject = data.starProjects?.find((p: StarProject) => p.id === id);
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
          <h1 className="text-lg font-semibold text-gray-900">项目详情</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="container mx-auto px-6 py-6 max-w-4xl">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{project.title}</h2>

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
        </div>
      </div>
    </div>
  );
}

