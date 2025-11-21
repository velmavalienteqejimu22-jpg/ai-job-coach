"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import EditableField from "./EditableField";
import EditableList from "./EditableList";
import EditableProjects, { Project } from "./EditableProjects";

export interface ParsedData {
  intent?: string;
  skills?: string[];
  projects?: Project[];
  resumeSummary?: string;
  [key: string]: any;
}

interface DynamicBoardProps {
  parsedData?: ParsedData;
  onUpdate?: (data: ParsedData) => void;
}

export default function DynamicBoard({ parsedData, onUpdate }: DynamicBoardProps) {
  const router = useRouter();

  const handleUpdate = (field: keyof ParsedData, value: any) => {
    if (onUpdate && parsedData) {
      const updatedData = {
        ...parsedData,
        [field]: value,
      };
      console.log("DynamicBoard: 更新字段", field, "新值:", value, "完整数据:", updatedData);
      onUpdate(updatedData);
    }
  };

  const handleResumeClick = (id: string) => {
    router.push(`/chat/resume/${id}`);
  };

  const handleInterviewClick = (round: string) => {
    router.push(`/chat/interview/${round}`);
  };

  // 如果没有数据，显示空状态
  if (!parsedData || Object.keys(parsedData).length === 0) {
    return (
      <div className="h-full bg-gray-50 border-l border-gray-200 p-6">
        <div className="h-full bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="text-4xl mb-4">📋</div>
              <div className="text-gray-500 text-sm font-medium">智能白板</div>
              <div className="text-gray-400 text-xs">
                在控制台设置 parsedData 以查看内容
              </div>
              <div className="text-gray-400 text-xs mt-2 font-mono text-[10px]">
                window.setParsedData({`{...}`})
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 动画配置
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20, y: 10 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
  };

  return (
    <div className="h-full bg-gray-50 border-l border-gray-200 p-6">
      <div className="h-full bg-white rounded-lg border border-gray-200 shadow-sm">
        <motion.div
          className="h-full p-4 overflow-y-auto space-y-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* 标题 */}
          <div className="border-b border-gray-200 pb-3">
            <h2 className="text-lg font-semibold text-gray-900">智能白板</h2>
            <p className="text-xs text-gray-500 mt-1">从对话中提取的关键信息</p>
          </div>

          {/* 意向岗位 */}
          {parsedData.intent !== undefined && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-cyan-50 rounded-lg border border-cyan-200"
            >
              <EditableField
                label="意向岗位"
                value={parsedData.intent || ""}
                onSave={(value) => handleUpdate("intent", value)}
                placeholder="暂无意向岗位"
              />
            </motion.div>
          )}

          {/* 核心技能 */}
          {parsedData.skills !== undefined && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-blue-50 rounded-lg border border-blue-200"
            >
              <EditableList
                label="核心技能"
                items={parsedData.skills || []}
                onSave={(items) => handleUpdate("skills", items)}
                placeholder="暂无技能"
              />
            </motion.div>
          )}

          {/* 项目经历 */}
          {parsedData.projects !== undefined && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-purple-50 rounded-lg border border-purple-200"
            >
              <EditableProjects
                projects={parsedData.projects || []}
                onSave={(projects) => handleUpdate("projects", projects)}
              />
            </motion.div>
          )}

          {/* 简历摘要 */}
          {parsedData.resumeSummary !== undefined && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-green-50 rounded-lg border border-green-200"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <EditableField
                    label="简历摘要"
                    value={parsedData.resumeSummary || ""}
                    onSave={(value) => handleUpdate("resumeSummary", value)}
                    multiline
                    placeholder="暂无简历摘要"
                  />
                </div>
                <button
                  onClick={() => handleResumeClick("1")}
                  className="ml-3 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-colors shadow-sm flex-shrink-0"
                >
                  查看对比
                </button>
              </div>
            </motion.div>
          )}

          {/* 简历优化项（如果有） */}
          {parsedData.resumeOptimizations && Array.isArray(parsedData.resumeOptimizations) && parsedData.resumeOptimizations.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-yellow-50 rounded-lg border border-yellow-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">简历优化建议</div>
              <div className="space-y-2">
                {parsedData.resumeOptimizations.map((item: any, index: number) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    className="p-3 bg-white rounded border border-yellow-200 cursor-pointer hover:border-yellow-300 transition-colors"
                    onClick={() => handleResumeClick(item.id || String(index + 1))}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 mb-1">
                          {item.title || `优化建议 ${index + 1}`}
                        </div>
                        <div className="text-xs text-gray-600 line-clamp-2">
                          {item.description || "点击查看详细对比"}
                        </div>
                      </div>
                      <span className="ml-2 text-xs text-cyan-600">→</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* 面试准备（如果有） */}
          {parsedData.interviewRounds && Array.isArray(parsedData.interviewRounds) && parsedData.interviewRounds.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-orange-50 rounded-lg border border-orange-200"
            >
              <div className="text-xs font-medium text-gray-500 mb-3">面试准备</div>
              <div className="space-y-2">
                {parsedData.interviewRounds.map((round: any, index: number) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    className="p-3 bg-white rounded border border-orange-200 cursor-pointer hover:border-orange-300 transition-colors"
                    onClick={() => handleInterviewClick(round.id || String(index + 1))}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 mb-1">
                          {round.name || `第 ${index + 1} 轮面试`}
                        </div>
                        <div className="text-xs text-gray-600 line-clamp-2">
                          {round.description || "点击开始模拟面试"}
                        </div>
                      </div>
                      <span className="ml-2 text-xs text-cyan-600">→</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

