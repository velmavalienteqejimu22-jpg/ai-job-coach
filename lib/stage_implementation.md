# 阶段控制逻辑实现说明

## 概述

实现了完整的用户求职流程阶段控制逻辑（userStage），让 AI 根据用户的回答判断是否完成当前阶段，并自动进入下一阶段。

---

## 新增文件

### `/lib/stage.ts`

定义了完整的阶段类型和工具函数：

- **UserStage 类型**：7 个阶段
  - `career_planning` - 职业规划
  - `project_review` - 项目梳理
  - `resume_optimization` - 简历优化
  - `application_strategy` - 投递策略
  - `interview` - 模拟面试
  - `salary_talk` - 薪资沟通
  - `offer` - Offer

- **工具函数**：
  - `getNextStage()` - 获取下一阶段
  - `getPrevStage()` - 获取上一阶段
  - `isValidStage()` - 验证阶段有效性
  - `StageNames` - 阶段中文名称映射
  - `StageDescriptions` - 阶段描述（用于 AI prompt）

---

## 修改的文件

### 1. `/app/api/chat/route.ts`（后端 API）

#### 接受的参数
```typescript
{
  "message": "用户消息",
  "userStage": "career_planning",  // 当前阶段
  "history": [                      // 历史对话（可选）
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "userState": {                    // 用户状态（可选）
    "identity": "应届生"
  }
}
```

#### 返回结构
```typescript
{
  "reply": "AI 的回复文本",
  "shouldAdvance": true/false,      // 是否应该进入下一阶段
  "nextStage": "project_review",    // 下一阶段（如果 shouldAdvance 为 true）
  "stageEvaluation": {
    "reason": "判断理由"
  }
}
```

#### 核心功能

1. **阶段验证和映射**：
   - 验证 `userStage` 是否有效
   - 支持旧阶段名称的自动映射（向后兼容）

2. **Prompt 注入**：
   - 在系统 prompt 中注入当前阶段信息
   - 明确阶段任务和引导原则
   - 要求 AI 返回 JSON 格式，包含阶段评估

3. **JSON 解析和验证**：
   - 解析 AI 返回的 JSON
   - 验证阶段推进的合理性
   - 降级处理：如果 JSON 解析失败，使用原始回复但不推进阶段

4. **历史对话支持**：
   - 支持传递历史对话上下文
   - 帮助 AI 更好地理解对话背景

---

### 2. `/app/chat/page.tsx`（前端组件）

#### 新增状态
```typescript
const [userStage, setUserStage] = useState<UserStage>("career_planning");
```

#### 核心功能

1. **状态初始化**：
   - 从 `localStorage` 读取保存的 `userStage`
   - 从注册信息中映射阶段
   - 默认从 `career_planning` 开始

2. **状态持久化**：
   - 自动保存 `userStage` 到 `localStorage`
   - 刷新页面后恢复阶段

3. **消息发送**：
   - 传递 `userStage` 和 `history` 到后端 API
   - 构建最近 10 条历史对话

4. **阶段推进处理**：
   - 检查 `shouldAdvance` 和 `nextStage`
   - 更新 `userStage` 状态
   - 同步更新 FSM（用于 UI 显示）
   - **刷新右侧白板**：清空 `parsedData`，准备接收新阶段的数据

---

## 工作流程

### 1. 用户发送消息
```
用户输入 → 前端发送 { message, userStage, history } → 后端 API
```

### 2. AI 处理和评估
```
后端接收 → 构建包含阶段信息的 prompt → 调用 LLM → 解析 JSON 响应
```

### 3. 阶段评估
```
AI 返回 {
  assistant_response: "回复文本",
  stage_evaluation: {
    should_advance: true/false,
    reason: "判断理由",
    next_stage: "下一阶段"
  }
}
```

### 4. 前端处理
```
接收响应 → 显示 AI 回复 → 检查 shouldAdvance → 更新 userStage → 刷新白板
```

---

## AI Prompt 设计

### 系统 Prompt 包含：

1. **角色定位**：资深职业顾问
2. **当前阶段信息**：
   - 阶段名称（中文）
   - 阶段任务描述
   - 下一阶段提示
3. **引导原则**：
   - 当前阶段任务未完成则继续深挖
   - 用户明确表达完成则推进
   - 不要跳跃阶段
4. **输出格式要求**：
   - 必须返回 JSON
   - 包含 `assistant_response` 和 `stage_evaluation`

---

## 阶段推进条件

AI 判断 `should_advance = true` 的条件：

1. **用户明确表达**：
   - "我完成了"
   - "继续下一步"
   - "可以了"
   - "准备好了"

2. **信息收集充分**：
   - 当前阶段任务已完成
   - 已收集到足够信息

3. **任务完成**：
   - 职业规划：已确定目标岗位
   - 项目梳理：已梳理完主要项目
   - 简历优化：简历已优化完成
   - 等等...

---

## 数据流

```
┌─────────────┐
│  前端状态    │
│ userStage   │ ──┐
└─────────────┘   │
                   │
┌─────────────┐   │
│  API 调用   │   │
│ message     │   │
│ userStage   │ ←─┘
│ history     │
└─────────────┘
       │
       ▼
┌─────────────┐
│  后端处理   │
│ 构建 Prompt │
│ 调用 LLM   │
│ 解析 JSON   │
└─────────────┘
       │
       ▼
┌─────────────┐
│  返回结果   │
│ reply       │
│ shouldAdvance│
│ nextStage   │
└─────────────┘
       │
       ▼
┌─────────────┐
│  前端更新   │
│ 显示回复    │
│ 更新阶段    │
│ 刷新白板    │
└─────────────┘
```

---

## 测试验证

### 1. 测试阶段推进

在浏览器控制台：
```javascript
// 查看当前阶段
console.log(window.userStage); // 需要暴露到 window

// 手动设置阶段
localStorage.setItem("ajc_userStage", "project_review");
location.reload();
```

### 2. 测试 API

```javascript
fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '我想做前端开发',
    userStage: 'career_planning',
    history: []
  })
})
.then(r => r.json())
.then(data => {
  console.log('回复:', data.reply);
  console.log('是否推进:', data.shouldAdvance);
  console.log('下一阶段:', data.nextStage);
});
```

### 3. 测试阶段推进

发送以下消息测试：
- "我完成了" → 应该推进到下一阶段
- "继续下一步" → 应该推进
- "我想做前端开发" → 在职业规划阶段，应该继续深挖

---

## 注意事项

1. **向后兼容**：
   - 支持旧的阶段名称映射
   - 如果 `userStage` 未提供，默认使用 `career_planning`

2. **错误处理**：
   - JSON 解析失败时，使用原始回复但不推进阶段
   - 网络错误时，保持当前阶段不变

3. **状态同步**：
   - `userStage` 和 FSM 的 `current` 保持同步
   - 两者用于不同目的：`userStage` 用于业务逻辑，FSM 用于 UI 显示

4. **白板刷新**：
   - 进入新阶段时自动清空 `parsedData`
   - 新阶段的数据由 `/api/analyze` 填充

---

## 未来扩展

1. **阶段回退**：支持用户主动返回上一阶段
2. **阶段跳转**：允许跳过某些阶段（需谨慎）
3. **阶段进度**：显示当前阶段的完成进度
4. **阶段历史**：记录阶段切换历史

---

## 文件清单

- ✅ `/lib/stage.ts` - 阶段定义和工具函数
- ✅ `/app/api/chat/route.ts` - 后端 API（已修改）
- ✅ `/app/chat/page.tsx` - 前端组件（已修改）

---

## 验证清单

- [x] 创建 `/lib/stage.ts` 文件
- [x] 修改 API 接受 `userStage` 和 `history`
- [x] API 返回 `shouldAdvance` 和 `nextStage`
- [x] 前端维护 `userStage` 状态
- [x] 前端传递 `userStage` 到 API
- [x] 前端处理阶段推进
- [x] 阶段推进时刷新白板
- [x] 状态持久化到 localStorage
- [x] 错误处理完善

