# 模拟面试面板组件使用说明

## 组件结构

- `InterviewPanel.tsx` - 主面板组件（三层布局）
- `QuestionCard.tsx` - 问题卡片组件
- `TipsCard.tsx` - 提示卡片组件
- `EvaluationCard.tsx` - 评估卡片组件

## 在主页面中挂载 InterviewPanel

### 方式一：在 `app/chat/page.tsx` 中条件渲染

```tsx
"use client";

import { useState } from "react";
import InterviewPanel from "@/components/interview/InterviewPanel";
import ChatFlow from "@/components/ChatFlow";
import Whiteboard from "@/components/Whiteboard";
// ... 其他导入

export default function ChatPage() {
  const [userStage, setUserStage] = useState("career_planning");
  
  // 当 userStage === 'interview' 时，显示 InterviewPanel
  if (userStage === "interview") {
    return (
      <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden">
        {/* 顶部导航等 */}
        <StageController currentStage="模拟面试" />
        
        {/* 主内容区域 */}
        <div className="flex-1 overflow-hidden" style={{ paddingTop: '64px' }}>
          <InterviewPanel userStage={userStage} />
        </div>
      </div>
    );
  }

  // 其他阶段的正常布局
  return (
    <div>
      {/* 正常的聊天界面 */}
    </div>
  );
}
```

### 方式二：在现有布局中替换中间区域

```tsx
// 在 app/chat/page.tsx 中
return (
  <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden">
    <StageController currentStage={fsm.getCurrentName()} />
    
    <div className="flex-1 flex overflow-hidden" style={{ paddingTop: '64px' }}>
      {/* 左侧聊天区域 */}
      {userStage !== "interview" && (
        <div className="w-full md:w-[70%]">
          <ChatFlow {...chatProps} />
        </div>
      )}

      {/* 中间区域：面试阶段显示 InterviewPanel，其他阶段显示正常内容 */}
      {userStage === "interview" ? (
        <InterviewPanel userStage={userStage} />
      ) : (
        <div className="flex-1">
          {/* 正常内容 */}
        </div>
      )}

      {/* 右侧白板区域 */}
      {userStage !== "interview" && (
        <div className="hidden md:block w-[30%]">
          <Whiteboard data={whiteboardData} currentStage={userStage} />
        </div>
      )}
    </div>
  </div>
);
```

## 与 Store 联动的完整示例

```tsx
"use client";

import { useEffect } from "react";
import { useInterviewStore } from "@/store/interviewStore";
import InterviewPanel from "@/components/interview/InterviewPanel";

export default function InterviewPage() {
  // 从 store 获取所有状态和方法
  const {
    // 状态
    sessionId,
    userId,
    roundType,
    roundIndex,
    currentQuestionIndex,
    questions,
    roundCompleted,
    history,

    // 方法
    initInterview,
    loadRound,
    answerQuestion,
    nextQuestion,
    finishRound,
    getCurrentQuestion,
  } = useInterviewStore();

  // 初始化面试会话
  useEffect(() => {
    // 从 localStorage 或其他地方获取 sessionId 和 userId
    const savedSessionId = localStorage.getItem("sessionId");
    const savedUserId = localStorage.getItem("userId");

    if (savedSessionId && savedUserId) {
      initInterview(savedSessionId, savedUserId);
    }
  }, []);

  // 开始一轮面试
  const handleStartRound = async () => {
    await loadRound("技术面");
  };

  // 手动回答当前问题（如果需要在外部调用）
  const handleAnswer = async (answerText: string) => {
    const currentQuestion = getCurrentQuestion();
    if (currentQuestion) {
      await answerQuestion(currentQuestion.id, answerText);
    }
  };

  return (
    <div className="h-screen w-full">
      {/* 顶部控制栏 */}
      <div className="h-16 bg-white border-b flex items-center justify-between px-6">
        <div>
          <h1 className="text-lg font-semibold">模拟面试</h1>
          {roundType && (
            <p className="text-sm text-gray-500">
              {roundType} - 第 {roundIndex + 1} 轮
            </p>
          )}
        </div>
        {!roundType && (
          <button
            onClick={handleStartRound}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            开始技术面
          </button>
        )}
      </div>

      {/* InterviewPanel 会自动处理所有交互 */}
      <InterviewPanel userStage="interview" />
    </div>
  );
}
```

## Store 方法调用示例

### 1. 初始化面试

```tsx
const { initInterview } = useInterviewStore();

// 在组件挂载时初始化
useEffect(() => {
  const sessionId = localStorage.getItem("sessionId");
  const userId = localStorage.getItem("userId");
  
  if (sessionId && userId) {
    initInterview(sessionId, userId, "技术面"); // 可选：建议轮次类型
  }
}, []);
```

### 2. 加载轮次

```tsx
const { loadRound } = useInterviewStore();

const handleStart = async () => {
  await loadRound("技术面"); // 或 "业务面"、"项目深挖"、"HR面"、"总监面"
};
```

### 3. 回答问题

```tsx
const { answerQuestion, getCurrentQuestion } = useInterviewStore();

const handleSubmit = async (answerText: string) => {
  const currentQuestion = getCurrentQuestion();
  if (currentQuestion) {
    await answerQuestion(currentQuestion.id, answerText);
  }
};
```

### 4. 导航问题

```tsx
const { nextQuestion, prevQuestion, finishRound, questions, currentQuestionIndex } = useInterviewStore();

const handleNext = () => {
  if (currentQuestionIndex >= questions.length - 1) {
    // 完成轮次
    finishRound({
      reportId: `report_${Date.now()}`,
      summary: "面试完成",
    });
  } else {
    nextQuestion();
  }
};

const handlePrev = () => {
  prevQuestion();
};
```

### 5. 获取当前问题

```tsx
const { getCurrentQuestion } = useInterviewStore();

const currentQuestion = getCurrentQuestion();

if (currentQuestion) {
  console.log("当前问题:", currentQuestion.q);
  console.log("问题状态:", currentQuestion.status);
  console.log("用户回答:", currentQuestion.userAnswer);
  console.log("评估结果:", currentQuestion.evaluation);
}
```

## 完整集成示例

```tsx
"use client";

import { useEffect, useState } from "react";
import { useInterviewStore } from "@/store/interviewStore";
import InterviewPanel from "@/components/interview/InterviewPanel";
import { UserStage } from "@/lib/stage";

export default function ChatPage() {
  const [userStage, setUserStage] = useState<UserStage>("career_planning");
  const { initInterview, loadRound } = useInterviewStore();

  // 当进入面试阶段时，初始化 store
  useEffect(() => {
    if (userStage === "interview") {
      const sessionId = localStorage.getItem("sessionId") || "session_123";
      const userId = localStorage.getItem("userId") || "user_456";
      
      initInterview(sessionId, userId);
      
      // 可选：自动加载第一轮面试
      // loadRound("技术面");
    }
  }, [userStage]);

  // 面试阶段显示 InterviewPanel
  if (userStage === "interview") {
    return (
      <div className="h-screen w-full bg-neutral-50 flex flex-col">
        <div className="flex-1 overflow-hidden" style={{ paddingTop: '64px' }}>
          <InterviewPanel userStage={userStage} />
        </div>
      </div>
    );
  }

  // 其他阶段的正常布局
  return (
    <div>
      {/* 正常聊天界面 */}
    </div>
  );
}
```

## 注意事项

1. **InterviewPanel 会自动检测 `userStage === 'interview'`**，如果不是面试阶段，组件会返回 `null`，不渲染任何内容。

2. **所有交互都在 InterviewPanel 内部处理**，包括：
   - 提交回答
   - 检测"下一题"关键词
   - 显示评估结果
   - 完成轮次

3. **Store 状态是全局的**，可以在任何组件中访问和修改。

4. **API 调用在 store 中处理**，组件只需要调用 store 方法即可。



