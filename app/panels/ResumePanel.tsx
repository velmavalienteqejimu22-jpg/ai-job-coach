"use client";

import { useState } from "react";

export default function ResumePanel({ onAchieve }: { onAchieve?: (label: string) => void }) {
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [resumeSuggestions, setResumeSuggestions] = useState<string>("");

  const uploadResume = async (file: File) => {
    setUploadError("");
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/resume-optimize", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.error || "上传失败");
        return;
      }
      setResumeSuggestions(data.suggestions || "");
      setUploadedFileName(file.name);
      onAchieve?.("简历达人 📄");
    } catch {
      setUploadError("网络错误，请稍后重试");
    } finally {
      setUploadLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadResume(file);
  };

  return (
    <div className="bg-[var(--card-bg)] border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
      <h2 className="font-semibold text-gray-800">简历优化</h2>
      <div
        className={`border-2 rounded-xl p-6 transition-colors ${dragActive ? "border-blue-400 bg-blue-50" : "border-dashed border-gray-200 bg-gray-50"}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) uploadResume(f); }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-gray-700">将简历拖拽到此处，或点击选择文件（暂仅支持 .txt）</div>
          <div className="flex items-center gap-2">
            <input id="resume-file-panel" type="file" accept=".txt,text/plain" className="hidden" onChange={onFileChange} />
            <label htmlFor="resume-file-panel" className={`px-3 py-2 rounded-xl text-white text-sm cursor-pointer transition-colors ${uploadLoading ? "bg-gray-400" : "bg-[var(--blue-500)] hover:bg-[var(--blue-600)]"}`}>{uploadLoading ? "正在分析…" : "上传简历"}</label>
          </div>
        </div>
        {uploadError && (<p className="text-xs text-red-600 mt-2">{uploadError}</p>)}
      </div>
      {resumeSuggestions && (
        <div className="border border-blue-100 rounded-2xl p-4 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-blue-700">建议</h3>
            {uploadedFileName && (<span className="text-xs text-blue-700 opacity-70">{uploadedFileName}</span>)}
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{resumeSuggestions}</pre>
        </div>
      )}
    </div>
  );
}


