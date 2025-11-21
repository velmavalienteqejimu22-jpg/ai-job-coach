"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type ResumeSection = {
  id: string;
  title: string;
  content: string;
  editable: boolean;
  aiEditable: boolean;
  collapsed: boolean;
};

type ResumePreview = {
  personalInfo: string;
  education: string;
  campusExperience: string;
  projects: string;
  workExperience: string;
  selfEvaluation: string;
};

export default function ResumeEditorPage() {
  const router = useRouter();
  const [sections, setSections] = useState<ResumeSection[]>([
    { id: "personal", title: "个人信息", content: "", editable: true, aiEditable: false, collapsed: false },
    { id: "education", title: "教育信息", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "campus", title: "在校经历", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "projects", title: "项目经历", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "work", title: "工作/实习经历", content: "", editable: true, aiEditable: true, collapsed: false },
    { id: "self", title: "个人评价", content: "", editable: true, aiEditable: true, collapsed: false },
  ]);

  const [preview, setPreview] = useState<ResumePreview>({
    personalInfo: "",
    education: "",
    campusExperience: "",
    projects: "",
    workExperience: "",
    selfEvaluation: "",
  });

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [aiOptimizing, setAiOptimizing] = useState<string | null>(null);

  // 从 localStorage 或 API 加载简历数据
  useEffect(() => {
    const loadResumeData = async () => {
      try {
        // 1. 先尝试从保存的编辑器数据加载
        const savedEditorData = localStorage.getItem("ajc_resumeEditor");
        if (savedEditorData) {
          const editorData = JSON.parse(savedEditorData);
          if (editorData.sections) {
            setSections(editorData.sections);
          }
          if (editorData.preview) {
            setPreview(editorData.preview);
          }
          return; // 如果有保存的数据，直接使用
        }

        // 2. 尝试从白板数据加载
        const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
        if (whiteboardDataStr) {
          const whiteboardData = JSON.parse(whiteboardDataStr);
          if (whiteboardData.resumeInsights && whiteboardData.resumeInsights.length > 0) {
            // 根据 AI 建议填充内容
            const insights = whiteboardData.resumeInsights;
            setSections((prev) => {
              return prev.map((section) => {
                // 简单映射：根据 section id 匹配对应的 insight
                const matchingInsight = insights.find((insight: any) => 
                  insight.section?.includes(section.title) || 
                  section.title.includes(insight.section || "")
                );
                if (matchingInsight && matchingInsight.optimized) {
                  return { ...section, content: matchingInsight.optimized };
                }
                return section;
              });
            });
          }
        }

        // 3. 尝试从对话历史解析简历信息
        try {
          const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
          const allMessages: any[] = [];
          
          if (chatHistoryStr) {
            const chatHistory = JSON.parse(chatHistoryStr);
            
            // 收集所有阶段的对话，优先使用简历优化阶段的，如果没有则使用所有阶段
            if (chatHistory["resume_optimization"] && Array.isArray(chatHistory["resume_optimization"])) {
              allMessages.push(...chatHistory["resume_optimization"]);
            } else {
              // 如果没有简历优化阶段的对话，收集所有阶段的对话
              Object.keys(chatHistory).forEach((stage) => {
                if (Array.isArray(chatHistory[stage])) {
                  allMessages.push(...chatHistory[stage]);
                }
              });
            }
            
            console.log("收集到的对话消息数量:", allMessages.length);
            
            if (allMessages.length > 0) {
              // 调用 API 解析简历信息
              const messages = allMessages.map((msg: any) => ({
                role: msg.isUser ? "user" : "assistant",
                content: msg.content,
              }));

              console.log("发送到解析 API 的消息:", messages.length, "条");

              const response = await fetch("/api/parse-resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages }),
              });

              if (response.ok) {
                const parsedData = await response.json();
                console.log("解析到的简历数据:", parsedData);
                
                // 填充到各个分区（只有当解析到的内容不为空时才填充）
                setSections((prev) => {
                  return prev.map((section) => {
                    let content = section.content;
                    switch (section.id) {
                      case "personal":
                        content = parsedData.personalInfo || content;
                        break;
                      case "education":
                        content = parsedData.education || content;
                        break;
                      case "campus":
                        content = parsedData.campusExperience || content;
                        break;
                      case "projects":
                        content = parsedData.projects || content;
                        break;
                      case "work":
                        content = parsedData.workExperience || content;
                        break;
                      case "self":
                        content = parsedData.selfEvaluation || content;
                        break;
                    }
                    // 只有当新内容不为空时才更新
                    if (content && content !== section.content) {
                      console.log(`填充 ${section.title}:`, content);
                    }
                    return { ...section, content };
                  });
                });
              } else {
                console.error("解析 API 返回错误:", response.status);
              }
            } else {
              console.log("没有找到对话历史");
            }
          } else {
            console.log("没有找到聊天历史记录");
          }
        } catch (parseError) {
          console.error("解析简历信息失败:", parseError);
        }
      } catch (error) {
        console.error("加载简历数据失败:", error);
      }
    };

    loadResumeData();
  }, []);

  const toggleSection = (id: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, collapsed: !section.collapsed } : section
      )
    );
  };

  const startEdit = (section: ResumeSection) => {
    setEditingSection(section.id);
    setEditContent(section.content);
  };

  const saveEdit = (id: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, content: editContent } : section
      )
    );
    setEditingSection(null);
    setEditContent("");
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditContent("");
  };

  const optimizeWithAI = async (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) return;

    setAiOptimizing(id);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `请优化以下${section.title}内容：\n\n${section.content}`,
          userStage: "resume_optimization",
          history: [],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.reply) {
          // 提取优化后的内容（简单处理）
          const optimizedContent = data.reply.replace(/优化后的内容[：:]\s*/i, "").trim();
          setSections((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, content: optimizedContent } : s
            )
          );
        }
      }
    } catch (error) {
      console.error("AI 优化失败:", error);
    } finally {
      setAiOptimizing(null);
    }
  };

  const applyToPreview = (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) return;

    setPreview((prev) => ({
      ...prev,
      [id === "personal" ? "personalInfo" :
        id === "education" ? "education" :
        id === "campus" ? "campusExperience" :
        id === "projects" ? "projects" :
        id === "work" ? "workExperience" :
        "selfEvaluation"]: section.content,
    }));
  };

  const downloadResume = () => {
    const resumeText = `
个人信息
${preview.personalInfo}

教育信息
${preview.education}

在校经历
${preview.campusExperience}

项目经历
${preview.projects}

工作/实习经历
${preview.workExperience}

个人评价
${preview.selfEvaluation}
    `.trim();

    const blob = new Blob([resumeText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "优化后的简历.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteResume = () => {
    if (confirm("确定要删除当前简历吗？")) {
      setPreview({
        personalInfo: "",
        education: "",
        campusExperience: "",
        projects: "",
        workExperience: "",
        selfEvaluation: "",
      });
    }
  };

  const handleBack = () => {
    // 保存简历数据到 localStorage
    try {
      const resumeData = {
        sections,
        preview,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem("ajc_resumeEditor", JSON.stringify(resumeData));
      
      // 保存当前阶段为"简历优化"，确保返回后停留在该阶段
      localStorage.setItem("ajc_userStage", "resume_optimization");
    } catch (error) {
      console.error("保存简历数据失败:", error);
    }
    
    router.push("/chat");
  };

  return (
    <React.Fragment>
      <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden">
        {/* 顶部导航 */}
        <div className="w-full h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 flex-shrink-0 z-10">
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <span>←</span>
            <span>返回</span>
          </motion.button>
          <h1 className="text-base font-semibold text-gray-900">简历优化编辑器</h1>
          <div className="w-10"></div>
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* 左侧分区编辑区 */}
          <div className="w-[50%] border-r border-gray-200 bg-white overflow-y-auto p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">编辑分区</h2>
          <div className="space-y-4">
            {sections.map((section) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* 分区标题栏 */}
                <div
                  className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => toggleSection(section.id)}
                >
                  <h3 className="font-medium text-gray-900">{section.title}</h3>
                  <div className="flex items-center gap-2">
                    {section.aiEditable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          optimizeWithAI(section.id);
                        }}
                        disabled={aiOptimizing === section.id}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                      >
                        {aiOptimizing === section.id ? "优化中..." : "AI优化"}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        applyToPreview(section.id);
                      }}
                      className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      应用
                    </button>
                    <span className="text-gray-400">
                      {section.collapsed ? "▼" : "▲"}
                    </span>
                  </div>
                </div>

                {/* 分区内容 */}
                {!section.collapsed && (
                  <div className="p-4">
                    {editingSection === section.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          rows={6}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(section.id)}
                            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700 whitespace-pre-wrap min-h-[60px]">
                          {section.content || "（暂无内容）"}
                        </div>
                        {section.editable && (
                          <button
                            onClick={() => startEdit(section)}
                            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            编辑
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          </div>

          {/* 右侧预览区 */}
          <div className="w-[50%] bg-white overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">简历预览</h2>
            <div className="flex gap-2">
              <button
                onClick={downloadResume}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                下载
              </button>
              <button
                onClick={deleteResume}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
              >
                删除
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
            {preview.personalInfo && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">个人信息</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.personalInfo}</p>
              </div>
            )}
            {preview.education && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">教育信息</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.education}</p>
              </div>
            )}
            {preview.campusExperience && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">在校经历</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.campusExperience}</p>
              </div>
            )}
            {preview.projects && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">项目经历</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.projects}</p>
              </div>
            )}
            {preview.workExperience && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">工作/实习经历</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.workExperience}</p>
              </div>
            )}
            {preview.selfEvaluation && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">个人评价</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{preview.selfEvaluation}</p>
              </div>
            )}
            {!preview.personalInfo && !preview.education && !preview.campusExperience && 
             !preview.projects && !preview.workExperience && !preview.selfEvaluation && (
              <div className="text-center text-gray-400 py-12">
                预览区域为空，请在左侧分区点击"应用"按钮填充内容
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

