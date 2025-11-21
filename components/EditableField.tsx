"use client";

import { useState, useEffect } from "react";

interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}

export default function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  placeholder = "点击编辑...",
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  // 当 value prop 变化时，同步更新 editValue（仅在非编辑状态）
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditValue(value); // 进入编辑模式时，从当前 value 初始化
    setIsEditing(true);
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        {multiline ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-cyan-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            rows={4}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleSave();
              } else if (e.key === "Escape") {
                handleCancel();
              }
            }}
          />
        ) : (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-cyan-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              } else if (e.key === "Escape") {
                handleCancel();
              }
            }}
          />
        )}
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
          <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
          <div className="text-sm text-gray-900 whitespace-pre-wrap">
            {value || <span className="text-gray-400 italic">{placeholder}</span>}
          </div>
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

