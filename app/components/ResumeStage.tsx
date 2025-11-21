"use client";

import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Download, Upload, Wand2 } from "./icons";

export default function ResumeStage() {
  const { dispatch, state } = useApp();
  const [uploadLoading, setUploadLoading] = useState(false);
  const [resumeSuggestions, setResumeSuggestions] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  
  const resumeInsights = state.whiteboard.resumeInsights;

  const uploadResume = async (file: File) => {
    setUploadLoading(true);
    try {
      // 先调用 parse-resume 解析文件
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/parse-resume", { method: "POST", body: formData });
      const parseData = await parseRes.json();

      if (!parseRes.ok) {
        alert(parseData?.error || "文件解析失败");
        setUploadLoading(false);
        return;
      }

      // 检查是否有错误提示（PDF/DOCX 可能无法解析）
      if (parseData.rawText && (parseData.rawText.includes("暂不支持直接解析") || parseData.rawText.includes("无法直接解析"))) {
        alert(parseData.rawText);
        setUploadLoading(false);
        return;
      }

      // 将解析结果写入白板
      dispatch({
        type: "UPDATE_RESUME_INSIGHTS",
        payload: {
          resumeInsights: {
            personalInfo: parseData.personalInfo || {},
            education: parseData.education || [],
            workExperience: parseData.workExperience || [],
            projects: parseData.projects || [],
            skills: parseData.skills || [],
            certifications: parseData.certifications || [],
            languages: parseData.languages || [],
            rawText: parseData.rawText || "",
          },
          rawText: parseData.rawText || "",
        },
      });

      // 同时调用 resume-optimize 获取优化建议
      const optimizeRes = await fetch("/api/resume-optimize", { method: "POST", body: formData });
      const optimizeData = await optimizeRes.json();
      if (optimizeRes.ok) {
        setResumeSuggestions(optimizeData.suggestions || "");
      }

      setUploadedFileName(file.name);
    } catch (error) {
      console.error("上传失败:", error);
      alert("网络错误，请稍后重试");
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <h2 className="font-bold text-slate-700">简历优化工作台</h2>
        <button className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded border border-blue-100 hover:bg-blue-100 flex items-center">
          <Download size={14} className="mr-1" /> 导出优化版
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：识别区 */}
        <div className="w-1/2 p-4 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="mb-4 p-4 border-2 border-dashed border-slate-300 rounded-lg text-center text-slate-500 hover:bg-slate-50 cursor-pointer">
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              id="resume-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadResume(file);
              }}
            />
            <label htmlFor="resume-upload" className="cursor-pointer">
              <Upload className="mb-2 mx-auto" size={24} />
              <p className="text-sm">点击上传 PDF / Word 简历</p>
            </label>
          </div>

          <div className="space-y-6">
            {/* 个人优势 */}
            <div className="group relative">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">个人优势</label>
              <div className="p-3 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50/50 transition cursor-text relative">
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {resumeInsights?.personalInfo?.summary || 
                   (resumeInsights?.skills && resumeInsights.skills.length > 0 
                     ? `核心技能：${resumeInsights.skills.join("、")}` 
                     : "熟悉 React, Vue 框架，具备 3 年前端开发经验...")}
                </p>
                <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-blue-600 text-white p-1.5 rounded shadow-sm text-xs flex items-center">
                  <Wand2 size={12} className="mr-1" /> AI 润色
                </button>
              </div>
            </div>

            {/* 工作经历 */}
            <div className="group relative">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">工作经历</label>
              <div className="p-3 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50/50 transition cursor-text relative">
                {resumeInsights?.workExperience && resumeInsights.workExperience.length > 0 ? (
                  <div className="space-y-3">
                    {resumeInsights.workExperience.map((work: any, idx: number) => (
                      <div key={idx} className="text-sm text-slate-600">
                        <div className="font-semibold">{work.company || ""} - {work.position || ""}</div>
                        <div className="text-xs text-slate-400 mt-1">{work.time || ""}</div>
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{work.description || ""}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">2021-2023 某互联网大厂 前端开发...</p>
                )}
                <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-blue-600 text-white p-1.5 rounded shadow-sm text-xs flex items-center">
                  <Wand2 size={12} className="mr-1" /> AI 润色
                </button>
              </div>
            </div>

            {/* 项目经历 */}
            <div className="group relative">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">项目经历</label>
              <div className="p-3 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50/50 transition cursor-text relative">
                {resumeInsights?.projects && resumeInsights.projects.length > 0 ? (
                  <div className="space-y-3">
                    {resumeInsights.projects.map((proj: any, idx: number) => (
                      <div key={idx} className="text-sm text-slate-600">
                        <div className="font-semibold">{proj.name || ""}</div>
                        <div className="text-xs text-slate-400 mt-1">{proj.time || ""}</div>
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{proj.description || ""}</div>
                        {proj.technologies && (
                          <div className="text-xs text-blue-600 mt-1">技术栈：{proj.technologies}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">此处显示识别到的内容...</p>
                )}
                <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-blue-600 text-white p-1.5 rounded shadow-sm text-xs flex items-center">
                  <Wand2 size={12} className="mr-1" /> AI 润色
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：预览区 */}
        <div className="w-1/2 p-6 bg-slate-100 overflow-y-auto">
          <div className="bg-white shadow-lg min-h-[800px] p-8 w-full mx-auto max-w-[210mm] text-xs scale-90 origin-top">
            <h1 className="text-xl font-bold mb-4 text-center border-b pb-2">简历预览</h1>
            {state.whiteboard.resume.rawText ? (
              <div className="space-y-4 text-slate-700 py-8">
                <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">
                  {state.whiteboard.resume.rawText}
                </pre>
              </div>
            ) : resumeSuggestions ? (
              <div className="space-y-4 text-slate-700 py-8 whitespace-pre-wrap">{resumeSuggestions}</div>
            ) : (
              <div className="space-y-4 text-slate-400 text-center py-20">
                此处将实时渲染优化后的简历效果...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

