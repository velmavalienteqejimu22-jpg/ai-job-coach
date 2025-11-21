"use client";

import { motion, AnimatePresence } from "framer-motion";

interface StageControllerProps {
  currentStage: string;
  onBack?: () => void;
  canGoBack?: boolean;
}

export default function StageController({
  currentStage,
  onBack,
  canGoBack = false,
}: StageControllerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 w-full h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 z-40 shadow-sm">
      <div className="flex items-center gap-4">
        <AnimatePresence mode="wait">
          {canGoBack && (
            <motion.button
              key="back-button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <span>←</span>
              <span>返回上一步</span>
            </motion.button>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">当前阶段：</span>
          <motion.span
            key={currentStage}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-base font-semibold text-gray-900"
          >
            {currentStage}
          </motion.span>
        </div>
      </div>
      <div className="text-xs text-gray-400">
        AI Job Coach
      </div>
    </div>
  );
}

