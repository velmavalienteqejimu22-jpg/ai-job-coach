# 模拟面试 API 前端调试指南

## 快速开始

### 1. 检查 API 模式

API 会自动检测环境变量 `DEEPSEEK_API_KEY`：
- **有 API key** → 使用 DeepSeek 模式（智能生成）
- **无 API key** → 使用 Stub 模式（硬编码 mock 数据）

### 2. 在浏览器控制台测试

打开浏览器开发者工具（F12），在 Console 中执行以下代码：

#### 测试 1: 开始一轮面试（start_round）

```javascript
fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'start_round',
    sessionId: 'test_session_123',
    userId: 'test_user_456',
    roundType: '技术面',
  }),
})
  .then(res => res.json())
  .then(data => {
    console.log('响应:', data);
    if (data.type === 'next-question') {
      console.log('问题:', data.payload.question.q);
      console.log('提示:', data.payload.question.tips);
    }
  })
  .catch(err => console.error('错误:', err));
```

**预期响应（Stub 模式）：**
```json
{
  "type": "next-question",
  "payload": {
    "question": {
      "id": "q_xxx",
      "q": "请详细描述一个你解决过的技术难题...",
      "tips": { ... }
    }
  },
  "debug": {
    "mode": "stub",
    "roundType": "技术面"
  }
}
```

#### 测试 2: 回答问题（answer）

```javascript
fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'answer',
    sessionId: 'test_session_123',
    userId: 'test_user_456',
    questionId: 'q_1234567890',
    answer: '我最近解决了一个数据库性能瓶颈问题。通过分析慢查询日志，发现是索引缺失导致的。我添加了合适的索引，并优化了查询语句，最终将查询时间从5秒降低到0.1秒。',
  }),
})
  .then(res => res.json())
  .then(data => {
    console.log('响应:', data);
    if (data.type === 'evaluation') {
      console.log('评估结果:', data.payload.evaluation);
      console.log('建议:', data.payload.evaluation.tips);
    }
  })
  .catch(err => console.error('错误:', err));
```

**预期响应（Stub 模式）：**
```json
{
  "type": "evaluation",
  "payload": {
    "questionId": "q_1234567890",
    "evaluation": {
      "accuracy": 75,
      "detail": 80,
      "logic": 70,
      "confidence": 85,
      "tips": "回答很好，数据支撑充分..."
    },
    "exemplarAnswer": "..."
  },
  "debug": {
    "mode": "stub",
    "answerLength": 150,
    "hasData": true
  }
}
```

#### 测试 3: 获取下一题（next_question）

```javascript
fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'next_question',
    roundType: '技术面',
    recentMessages: [
      {
        role: 'assistant',
        content: '请详细描述一个你解决过的技术难题...',
      },
      {
        role: 'user',
        content: '我最近解决了一个数据库性能瓶颈问题...',
      },
    ],
  }),
})
  .then(res => res.json())
  .then(data => {
    console.log('响应:', data);
    if (data.type === 'next-question') {
      console.log('下一题:', data.payload.question.q);
    }
  })
  .catch(err => console.error('错误:', err));
```

#### 测试 4: 完成轮次（finish_round）

```javascript
fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'finish_round',
    roundType: '技术面',
    recentMessages: [
      {
        role: 'assistant',
        content: '问题1...',
      },
      {
        role: 'user',
        content: '回答1...',
      },
      {
        role: 'assistant',
        content: '问题2...',
      },
      {
        role: 'user',
        content: '回答2...',
      },
    ],
  }),
})
  .then(res => res.json())
  .then(data => {
    console.log('响应:', data);
    if (data.type === 'round-complete') {
      console.log('总结:', data.payload.summary);
      console.log('报告ID:', data.payload.reportId);
    }
  })
  .catch(err => console.error('错误:', err));
```

**预期响应（Stub 模式）：**
```json
{
  "type": "round-complete",
  "payload": {
    "summary": {
      "scores": {
        "accuracy": 75,
        "detail": 65,
        "logic": 80,
        "confidence": 70
      },
      "highlights": ["结构清晰", "逻辑性强"],
      "gaps": ["项目细节可以更具体"],
      "practiceSuggestions": ["补充一个更定量的项目结果"]
    },
    "reportId": "report_xxx"
  },
  "debug": {
    "mode": "stub"
  }
}
```

## 在 React 组件中调试

### 使用 interviewStore

```tsx
"use client";

import { useEffect } from "react";
import { useInterviewStore } from "@/store/interviewStore";

export default function InterviewDebug() {
  const {
    initInterview,
    loadRound,
    answerQuestion,
    getCurrentQuestion,
    questions,
  } = useInterviewStore();

  useEffect(() => {
    // 初始化
    initInterview("test_session", "test_user");
  }, []);

  const testStartRound = async () => {
    console.log("开始测试 start_round...");
    await loadRound("技术面");
    console.log("问题列表:", questions);
  };

  const testAnswer = async () => {
    const currentQuestion = getCurrentQuestion();
    if (currentQuestion) {
      console.log("开始测试 answer...");
      await answerQuestion(
        currentQuestion.id,
        "这是我的测试回答..."
      );
      console.log("更新后的问题:", getCurrentQuestion());
    }
  };

  return (
    <div className="p-4 space-y-2">
      <button onClick={testStartRound}>测试开始轮次</button>
      <button onClick={testAnswer}>测试回答问题</button>
      <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
        {JSON.stringify(questions, null, 2)}
      </pre>
    </div>
  );
}
```

## 使用 Postman 或 curl 测试

### curl 示例

```bash
# 1. 开始轮次
curl -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_round",
    "sessionId": "test_session",
    "userId": "test_user",
    "roundType": "技术面"
  }'

# 2. 回答问题
curl -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "answer",
    "sessionId": "test_session",
    "userId": "test_user",
    "questionId": "q_123",
    "answer": "我的回答..."
  }'
```

## 调试技巧

### 1. 检查响应类型

```javascript
const data = await response.json();
console.log('响应类型:', data.type);
console.log('调试信息:', data.debug);

if (data.type === 'error') {
  console.error('错误:', data.payload.message);
}
```

### 2. 验证数据结构

```javascript
// 检查 next-question 响应
if (data.type === 'next-question') {
  const question = data.payload.question;
  console.assert(question.id, '问题缺少 id');
  console.assert(question.q, '问题缺少 q 字段');
  console.assert(question.tips, '问题缺少 tips');
}

// 检查 evaluation 响应
if (data.type === 'evaluation') {
  const eval = data.payload.evaluation;
  console.assert(eval.accuracy >= 0 && eval.accuracy <= 100, 'accuracy 范围错误');
  console.assert(eval.detail >= 0 && eval.detail <= 100, 'detail 范围错误');
}
```

### 3. 监控网络请求

在浏览器 Network 标签中：
1. 过滤 `interview`
2. 查看请求和响应
3. 检查响应时间（Stub 模式应该很快，DeepSeek 模式可能需要几秒）

### 4. 检查环境变量

```javascript
// 在服务器端（不能在前端直接访问）
// 检查 .env.local 文件
// DEEPSEEK_API_KEY=your_key_here
```

## 常见问题

### Q: 为什么返回的是 stub 数据？

A: 检查 `.env.local` 文件是否包含 `DEEPSEEK_API_KEY`。如果没有，API 会自动使用 stub 模式。

### Q: 如何切换到 DeepSeek 模式？

A: 在 `.env.local` 中添加：
```
DEEPSEEK_API_KEY=your_deepseek_api_key
```
然后重启开发服务器。

### Q: 响应格式不符合预期？

A: 检查 `data.type` 字段，确保是期望的类型（`next-question`、`evaluation`、`round-complete`）。

### Q: 如何查看详细的调试信息？

A: 响应中的 `debug` 字段包含调试信息，包括：
- `mode`: "stub" 或 "deepseek"
- 其他字段根据 action 类型不同

## 完整测试流程

```javascript
// 1. 开始面试
const startRes = await fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'start_round',
    sessionId: 'test_123',
    userId: 'test_456',
    roundType: '技术面',
  }),
});
const startData = await startRes.json();
console.log('开始面试:', startData);

// 2. 回答问题
const questionId = startData.payload.question.id;
const answerRes = await fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'answer',
    sessionId: 'test_123',
    userId: 'test_456',
    questionId,
    answer: '我的回答...',
  }),
});
const answerData = await answerRes.json();
console.log('评估结果:', answerData);

// 3. 获取下一题
const nextRes = await fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'next_question',
    roundType: '技术面',
    recentMessages: [
      { role: 'assistant', content: startData.payload.question.q },
      { role: 'user', content: '我的回答...' },
    ],
  }),
});
const nextData = await nextRes.json();
console.log('下一题:', nextData);

// 4. 完成轮次
const finishRes = await fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'finish_round',
    roundType: '技术面',
    recentMessages: [
      { role: 'assistant', content: '问题1' },
      { role: 'user', content: '回答1' },
    ],
  }),
});
const finishData = await finishRes.json();
console.log('完成轮次:', finishData);
```



