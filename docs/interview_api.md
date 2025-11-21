# 模拟面试 API 文档

## 概述

`/api/interview` 是模拟面试的统一 API 接口，支持多种 action，可以处理面试流程的各个环节。

## 端点

```
POST /api/interview
```

## 请求格式

### 通用请求体

```typescript
{
  sessionId?: string;        // 会话ID（可选）
  userId?: string;           // 用户ID（可选）
  action: string;            // 操作类型（必需）
  roundType?: string;        // 轮次类型（部分 action 需要）
  questionId?: string;       // 问题ID（部分 action 需要）
  answer?: string;           // 用户回答（部分 action 需要）
  recentMessages?: Array<{   // 最近消息（可选，用于上下文）
    role: "user" | "assistant";
    content: string;
  }>;
}
```

### Action 类型

- `start_round` - 开始一轮面试
- `answer` - 回答问题
- `next_question` - 获取下一题
- `finish_round` - 完成轮次

## 响应格式

### 统一响应结构

```typescript
{
  type: "next-question" | "evaluation" | "round-complete" | "error";
  payload: any;              // 具体数据
  debug?: any;               // 调试信息（可选）
}
```

## Action 详情

### 1. start_round - 开始一轮面试

**请求示例：**

```json
{
  "action": "start_round",
  "sessionId": "session_123",
  "userId": "user_456",
  "roundType": "技术面"
}
```

**响应示例（next-question）：**

```json
{
  "type": "next-question",
  "payload": {
    "question": {
      "id": "q_1234567890",
      "q": "请详细描述一个你解决过的技术难题...",
      "tips": {
        "intent": "考察技术深度、问题解决能力和技术思维",
        "keyPoints": ["问题要具体且有挑战性", "分析过程要体现技术思维"],
        "framework": "问题描述 → 问题分析 → 解决方案 → 实施过程 → 效果验证",
        "industryNotes": "技术面试更关注解决问题的思路和技术深度",
        "pitfalls": ["问题描述不清晰", "缺乏技术细节"],
        "proTips": ["准备一个能体现技术深度的案例", "突出解决问题的思路"]
      }
    }
  },
  "debug": {
    "mode": "stub",
    "roundType": "技术面"
  }
}
```

### 2. answer - 回答问题

**请求示例：**

```json
{
  "action": "answer",
  "sessionId": "session_123",
  "userId": "user_456",
  "questionId": "q_1234567890",
  "answer": "我最近解决了一个数据库性能瓶颈问题..."
}
```

**响应示例（evaluation）：**

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
      "tips": "回答很好，数据支撑充分。建议在逻辑结构上可以更清晰一些。"
    },
    "exemplarAnswer": "这是一个示范回答，包含了项目背景、个人角色、关键决策、执行过程和量化结果。"
  },
  "debug": {
    "mode": "stub",
    "answerLength": 150,
    "hasData": true,
    "hasDetail": true,
    "hasStructure": true
  }
}
```

### 3. next_question - 获取下一题

**请求示例：**

```json
{
  "action": "next_question",
  "roundType": "技术面",
  "recentMessages": [
    {
      "role": "assistant",
      "content": "请详细描述一个你解决过的技术难题..."
    },
    {
      "role": "user",
      "content": "我最近解决了一个数据库性能瓶颈问题..."
    }
  ]
}
```

**响应示例（next-question）：**

```json
{
  "type": "next-question",
  "payload": {
    "question": {
      "id": "q_1234567891",
      "q": "请描述一次数据驱动的决策...",
      "tips": {
        "intent": "考察数据分析和决策能力",
        "keyPoints": ["数据来源", "分析方法", "决策依据"],
        "framework": "数据收集 → 分析 → 决策 → 验证"
      }
    }
  },
  "debug": {
    "mode": "stub",
    "currentIndex": 1,
    "total": 3
  }
}
```

### 4. finish_round - 完成轮次

**请求示例：**

```json
{
  "action": "finish_round",
  "roundType": "技术面",
  "recentMessages": [
    {
      "role": "assistant",
      "content": "问题1..."
    },
    {
      "role": "user",
      "content": "回答1..."
    }
  ]
}
```

**响应示例（round-complete）：**

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
      "highlights": ["结构清晰", "逻辑性强", "表达流畅"],
      "gaps": ["项目细节可以更具体", "数据支撑可以更充分"],
      "practiceSuggestions": [
        "补充一个更定量的项目结果",
        "准备更多 STAR 案例",
        "加强数据化表达"
      ]
    },
    "reportId": "report_1234567890"
  },
  "debug": {
    "mode": "stub"
  }
}
```

### 5. error - 错误响应

**响应示例：**

```json
{
  "type": "error",
  "payload": {
    "message": "缺少 action 参数"
  }
}
```

## 工作模式

### Stub 模式

当 `DEEPSEEK_API_KEY` 环境变量未设置时，API 会使用 stub 模式，返回硬编码的 mock 数据。

**特点：**
- 无需 API key
- 快速响应
- 数据固定，适合开发和测试

### DeepSeek 模式

当 `DEEPSEEK_API_KEY` 环境变量已设置时，API 会调用 DeepSeek 模型生成动态内容。

**特点：**
- 需要 API key
- 内容动态生成
- 更智能的评估和建议

**降级机制：**
如果 DeepSeek 调用失败，会自动降级到 stub 模式，确保服务可用性。

## 轮次类型

支持的轮次类型：
- `业务面`
- `项目深挖`
- `技术面`
- `HR面`
- `总监面`

## 错误处理

所有错误都会返回统一的错误格式：

```json
{
  "type": "error",
  "payload": {
    "message": "错误描述"
  }
}
```

常见错误：
- `400` - 缺少必需参数
- `500` - 服务器内部错误

## 与 interviewStore 的集成

API 返回的数据结构完全符合 `interviewStore` 的期望：

- `next-question` → 用于 `loadRound()` 和 `nextQuestion()`
- `evaluation` → 用于 `setEvaluation()`
- `round-complete` → 用于 `finishRound()`

## 使用示例

### 前端调用示例

```typescript
// 开始一轮面试
const response = await fetch('/api/interview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'start_round',
    sessionId: 'session_123',
    userId: 'user_456',
    roundType: '技术面',
  }),
});

const data = await response.json();
if (data.type === 'next-question') {
  // 处理问题
  const question = data.payload.question;
}
```

## 调试

响应中的 `debug` 字段包含调试信息，可以帮助了解 API 的工作状态：

- `mode` - 当前模式（"stub" 或 "deepseek"）
- 其他字段根据 action 类型不同而不同



