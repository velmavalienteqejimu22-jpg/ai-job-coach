"use client";

import { useState, useEffect } from "react";

interface EditableListProps {
  label: string;
  items: string[];
  onSave: (items: string[]) => void;
  placeholder?: string;
}

export default function EditableList({
  label,
  items,
  onSave,
  placeholder = "点击编辑...",
}: EditableListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editItems, setEditItems] = useState(items);

  // 当 items prop 变化时，同步更新 editItems（仅在非编辑状态）
  useEffect(() => {
    if (!isEditing) {
      setEditItems(items);
    }
  }, [items, isEditing]);

  const handleSave = () => {
    onSave(editItems.filter((item) => item.trim() !== ""));
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditItems(items);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditItems(items); // 进入编辑模式时，从当前 items 初始化
    setIsEditing(true);
  };

  const addItem = () => {
    setEditItems([...editItems, ""]);
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...editItems];
    newItems[index] = value;
    setEditItems(newItems);
  };

  const removeItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        <div className="space-y-2">
          {editItems.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(index, e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-cyan-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder={`项目 ${index + 1}`}
                autoFocus={index === editItems.length - 1 && item === ""}
              />
              <button
                onClick={() => removeItem(index)}
                className="px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
              >
                删除
              </button>
            </div>
          ))}
          <button
            onClick={addItem}
            className="w-full px-3 py-2 text-xs text-cyan-600 border border-cyan-300 rounded-lg hover:bg-cyan-50 transition-colors"
          >
            + 添加项
          </button>
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
          <div className="text-xs font-medium text-gray-500 mb-2">{label}</div>
          {items.length > 0 ? (
            <div className="space-y-1">
              {items.map((item, index) => (
                <div key={index} className="text-sm text-gray-900">
                  • {item}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">{placeholder}</div>
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

