"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

interface DetailsLayoutProps {
  children: ReactNode;
}

export default function DetailsLayout({ children }: DetailsLayoutProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/chat")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="text-xl">←</span>
              <span className="font-medium">返回对话</span>
            </button>
            <div className="flex-1"></div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="container mx-auto px-6 py-6">
        {children}
      </div>
    </div>
  );
}

