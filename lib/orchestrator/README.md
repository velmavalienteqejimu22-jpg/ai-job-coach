# 多模型编排器（Orchestrator）

## 概述

多模型编排器根据用户当前阶段（userStage）自动选择对应的专业模型，实现不同阶段使用不同模型进行协作。

## 架构

```
用户消息
  ↓
/api/chat
  ↓
runOrchestrator({ userStage, messages })
  ↓
根据 userStage 选择对应模型
  ↓
返回 { reply, structured }
  ↓
前端更新对话和白板
```

## 目录结构

```
lib/orchestrator/
├── index.ts                    # 主编排器
├── prompts/                    # 各阶段的系统提示词
│   ├── career_planning.ts
│   ├── project_review.ts
│   ├── resume_optimization.ts
│   ├── application_strategy.ts
│   ├── interview.ts
│   ├── salary_talk.ts
│   └── offer.ts
└── models/                     # 各阶段的模型实现
    ├── career_planning.ts
    ├── project_review.ts
    ├── resume_optimization.ts
    ├── application_strategy.ts
    ├── interview.ts
    ├── salary_talk.ts
    └── offer.ts
```

## 模型接口

每个模型文件必须导出：

```typescript
export async function runDeepSeek[Stage](
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{
  reply: string;
  structured: any;
}>
```

## 统一返回格式

```typescript
{
  reply: string;           // 对话回复
  structured: {            // 白板数据结构
    intentRole?: string;
    keySkills?: string[];
    starProjects?: Array<{...}>;
    resumeInsights?: Array<{...}>;
    interviewReports?: Array<{...}>;
    targetCompanies?: Array<{...}>;
    salaryStrategy?: {...};
    offers?: Array<{...}>;
  }
}
```

## 阶段映射

| userStage | 模型函数 | 系统提示词 |
|-----------|---------|-----------|
| `career_planning` | `runDeepSeekCareer` | `CAREER_PLANNING_SYSTEM_PROMPT` |
| `project_review` | `runDeepSeekProjectReview` | `PROJECT_REVIEW_SYSTEM_PROMPT` |
| `resume_optimization` | `runDeepSeekResume` | `RESUME_OPTIMIZATION_SYSTEM_PROMPT` |
| `application_strategy` | `runDeepSeekStrategy` | `APPLICATION_STRATEGY_SYSTEM_PROMPT` |
| `interview` | `runDeepSeekInterview` | `INTERVIEW_SYSTEM_PROMPT` |
| `salary_talk` | `runDeepSeekSalary` | `SALARY_TALK_SYSTEM_PROMPT` |
| `offer` | `runDeepSeekOffer` | `OFFER_SYSTEM_PROMPT` |

## 使用示例

### 在 API 中使用

```typescript
import { runOrchestrator } from "@/lib/orchestrator";

const result = await runOrchestrator({
  userStage: "career_planning",
  messages: [
    { role: "user", content: "我想做前端开发" },
  ],
});

// result.reply - 对话回复
// result.structured - 白板数据
```

### 前端接收

```typescript
const data = await response.json();

// 显示对话
addMessage({ role: "assistant", content: data.reply });

// 更新白板
if (data.structured) {
  updateWhiteboard(data.structured);
}
```

## 扩展新模型

1. 在 `prompts/` 中创建系统提示词文件
2. 在 `models/` 中创建模型实现文件
3. 在 `index.ts` 中添加 case 分支

示例：

```typescript
// lib/orchestrator/prompts/new_stage.ts
export const NEW_STAGE_SYSTEM_PROMPT = `...`;

// lib/orchestrator/models/new_stage.ts
export async function runDeepSeekNewStage(messages) {
  // 实现逻辑
}

// lib/orchestrator/index.ts
case "new_stage":
  return await runDeepSeekNewStage(messages);
```

## 注意事项

1. **API Key 安全**：
   - ✅ 所有模型调用都在服务器端
   - ✅ 使用 `process.env.DEEPSEEK_API_KEY`
   - ❌ 不要暴露到前端

2. **提示词管理**：
   - 每个阶段有独立的系统提示词
   - 提示词文件只包含字符串常量
   - 不包含业务逻辑

3. **结构化数据提取**：
   - 当前使用简单的关键词匹配
   - 未来可以改进为要求 LLM 返回 JSON
   - 或使用专门的 NLP 工具

4. **错误处理**：
   - 所有模型调用都有错误处理
   - 失败时返回降级响应

## 未来优化

1. **结构化输出**：要求 LLM 直接返回 JSON
2. **多模型支持**：不同阶段可以使用不同的 LLM 提供商
3. **缓存机制**：缓存常见问题的回复
4. **A/B 测试**：测试不同提示词的效果
5. **性能监控**：监控每个模型的响应时间和成功率

