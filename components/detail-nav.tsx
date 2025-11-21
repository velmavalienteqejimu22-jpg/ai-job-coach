"use client";

import { useRouter } from "next/navigation";

interface DetailNavProps {
  title?: string;
  backPath?: string;
}

export default function DetailNav({ title, backPath = "/chat" }: DetailNavProps) {
  const router = useRouter();

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(backPath)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span className="text-xl">←</span>
            <span className="font-medium">返回</span>
          </button>
          {title && (
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          )}
          <div className="w-20"></div>
        </div>
      </div>
    </div>
  );
}

