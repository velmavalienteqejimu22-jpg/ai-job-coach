"use client";

import { useState, useEffect } from "react";

export interface Project {
  name: string;
  description: string;
}

interface EditableProjectsProps {
  projects: Project[];
  onSave: (projects: Project[]) => void;
}

export default function EditableProjects({
  projects,
  onSave,
}: EditableProjectsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editProjects, setEditProjects] = useState(projects);

  // 当 projects prop 变化时，同步更新 editProjects（仅在非编辑状态）
  useEffect(() => {
    if (!isEditing) {
      setEditProjects(projects);
    }
  }, [projects, isEditing]);

  const handleSave = () => {
    onSave(editProjects.filter((p) => p.name.trim() !== ""));
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditProjects(projects);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditProjects(projects); // 进入编辑模式时，从当前 projects 初始化
    setIsEditing(true);
  };

  const addProject = () => {
    setEditProjects([...editProjects, { name: "", description: "" }]);
  };

  const updateProject = (index: number, field: keyof Project, value: string) => {
    const newProjects = [...editProjects];
    newProjects[index] = { ...newProjects[index], [field]: value };
    setEditProjects(newProjects);
  };

  const removeProject = (index: number) => {
    setEditProjects(editProjects.filter((_, i) => i !== index));
  };

  if (isEditing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-500">项目经历</label>
          <button
            onClick={addProject}
            className="px-2 py-1 text-xs text-cyan-600 border border-cyan-300 rounded hover:bg-cyan-50 transition-colors"
          >
            + 添加项目
          </button>
        </div>
        <div className="space-y-3">
          {editProjects.map((project, index) => (
            <div key={index} className="p-3 border border-cyan-500 rounded-lg space-y-2">
              <input
                type="text"
                value={project.name}
                onChange={(e) => updateProject(index, "name", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="项目名称"
              />
              <textarea
                value={project.description}
                onChange={(e) => updateProject(index, "description", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                rows={3}
                placeholder="项目描述（STAR 格式）"
              />
              <button
                onClick={() => removeProject(index)}
                className="px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
              >
                删除项目
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 transition-colors"
          >
            保存
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-500 mb-2">项目经历</div>
          {projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map((project, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="text-sm font-medium text-gray-900 mb-1">
                    {project.name}
                  </div>
                  <div className="text-xs text-gray-600 whitespace-pre-wrap">
                    {project.description}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">暂无项目经历</div>
          )}
        </div>
        <button
          onClick={handleStartEdit}
          className="ml-2 px-2 py-1 text-xs text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          编辑
        </button>
      </div>
    </div>
  );
}

