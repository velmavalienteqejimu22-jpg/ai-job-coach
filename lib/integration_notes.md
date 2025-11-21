# API 集成说明：将 Stub 替换为真实 LLM 调用

本文档说明如何将 `/api/chat` 和 `/api/analyze` 的 stub 实现替换为真实的 OpenAI/DeepSeek 模型调用。

## ⚠️ 重要安全提示

1. **永远不要在前端代码中暴露 API Key**
2. **所有 API Key 必须存储在环境变量中**
3. **确保 `.env.local` 已添加到 `.gitignore`**
4. **生产环境使用 Vercel 等平台的环境变量配置**

---

## 步骤 1：配置环境变量

### 1.1 创建 `.env.local` 文件（如果不存在）

在项目根目录创建 `.env.local` 文件：

```bash
# .env.local
DEEPSEEK_API_KEY=your_deepseek_api_key_here
# 或使用 OpenAI
OPENAI_API_KEY=your_openai_api_key_here
```

### 1.2 获取 API Key

**DeepSeek:**
1. 访问 https://platform.deepseek.com
2. 注册/登录账号
3. 进入 API Keys 页面创建新 Key

**OpenAI:**
1. 访问 https://platform.openai.com
2. 注册/登录账号
3. 进入 API Keys 页面创建新 Key

### 1.3 验证环境变量

在 Next.js 中，环境变量会自动加载。确保：
- `.env.local` 文件在项目根目录
- 变量名以 `NEXT_PUBLIC_` 开头的会暴露到前端（**不要用于 API Key**）
- 重启开发服务器后环境变量生效

---

## 步骤 2：创建通用 LLM 调用函数

在 `lib/llm.ts` 创建通用调用函数（如果不存在）：

```typescript
// lib/llm.ts
import OpenAI from "openai";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 调用 LLM API（支持 DeepSeek 和 OpenAI）
 * @param messages 消息数组
 * @param options 可选配置
 * @returns AI 回复文本
 */
export async function callLLM(
  messages: Message[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: "deepseek" | "openai";
  }
): Promise<string> {
  const provider = options?.provider || "deepseek";
  const apiKey = provider === "deepseek" 
    ? process.env.DEEPSEEK_API_KEY 
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY not found in environment variables`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider === "deepseek" 
      ? "https://api.deepseek.com" 
      : undefined, // OpenAI 使用默认 baseURL
  });

  try {
    const completion = await client.chat.completions.create({
      model: options?.model || (provider === "deepseek" ? "deepseek-chat" : "gpt-3.5-turbo"),
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 500,
    });

    return completion.choices[0]?.message?.content || "抱歉，我这边暂时没响应，请稍后再试。";
  } catch (error) {
    console.error(`${provider} API 调用失败:`, error);
    throw error;
  }
}
```

---

## 步骤 3：替换 `/api/chat` 实现

### 3.1 修改 `app/api/chat/route.ts`

**替换前（Stub）：**
```typescript
// 模拟处理延迟 600ms
await new Promise((resolve) => setTimeout(resolve, 600));

// 根据用户消息生成模拟回复
let reply = "这是一个模拟的 AI 回复。";
// ... 关键词匹配逻辑
```

**替换后（真实 LLM 调用）：**
```typescript
import { callLLM } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json().catch(() => ({}));
    const { userMessage, userState } = body;

    // 构建系统提示词
    const systemPrompt = `你是深谙中国就业市场的资深职业顾问，尤其熟悉头部科技企业与国有企业领域。
需具备同理心强、沟通温和、专业度高、逻辑清晰的特质。
请严格按以下步骤引导用户求职，每步衔接需自然：
1. 职业规划指导
2. 经历与技能梳理提炼
3. 作品集指导
4. 简历优化
5. 投递策略指导
6. 了解用户投递细节与岗位描述
7. 结合经历与岗位描述模拟面试
8. 用户在真实面试（多轮）后带领复盘
9. 获offer后协助选择与薪资谈判

引导时需满足：
- 多提细节问题，收集充足信息以提供帮助
- 语气鼓励引导，适配用户语气与效率偏好
- 输出简洁（理想50字内），需深度分析时除外
- 信息充足或用户提示时自动进入下一步
- 避免重复内容，肯定与引导语需多样
- 遇不了解的内容如实说明，向用户索要补充信息
- 必要时将话题拉回求职相关

${userState?.currentStage ? `当前阶段：${userState.currentStage}` : ""}
${userState?.identity ? `用户身份：${userState.identity}` : ""}`;

    // 构建消息数组
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage || "你好" },
    ];

    // 调用 LLM
    const reply = await callLLM(messages, {
      temperature: 0.7,
      maxTokens: 500,
      provider: "deepseek", // 或 "openai"
    });

    // 可选：根据回复内容判断是否需要更新阶段
    let stage_update: string | null = null;
    // 可以添加简单的关键词检测逻辑来判断阶段更新

    return NextResponse.json({
      reply,
      stage_update,
    });
  } catch (error) {
    console.error("API 处理错误:", error);
    return NextResponse.json(
      { 
        reply: "抱歉，处理你的请求时出现了错误。请稍后再试。",
        stage_update: null 
      },
      { status: 500 }
    );
  }
}
```

---

## 步骤 4：替换 `/api/analyze` 实现

### 4.1 修改 `app/api/analyze/route.ts`

**替换前（Stub）：**
```typescript
// 模拟分析延迟 800ms
await new Promise((resolve) => setTimeout(resolve, 800));

// 简单的关键词匹配分析逻辑
const allText = recentMessages.join(" ").toLowerCase();
// ... 关键词匹配
```

**替换后（真实 LLM 调用）：**
```typescript
import { callLLM } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json().catch(() => ({}));
    const { recentMessages = [] } = body;

    // 构建分析提示词
    const analysisPrompt = `你是一个专业的求职对话分析助手。请分析以下对话内容，提取关键信息并返回 JSON 格式。

要求：
1. 判断当前求职阶段（planning/career/project/resume/apply/interview/salary/offer）
2. 评估进度（0-1之间的浮点数）
3. 提取意向岗位（如果有）
4. 提取核心技能（数组）
5. 提取项目经历（数组，包含 title, depth, description）
6. 提取简历摘要（如果有）

对话内容：
${recentMessages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

请严格按照以下 JSON 格式返回，不要包含其他文字：
{
  "stage": "阶段名称",
  "progress": 0.0-1.0,
  "intent_text": "意向岗位或null",
  "skills": ["技能1", "技能2"],
  "projects": [{"title": "项目名", "depth": 1, "description": "描述"}],
  "resumeSummary": "摘要或null"
}`;

    // 调用 LLM 进行分析
    const analysisResult = await callLLM(
      [
        { role: "system", content: "你是一个专业的 JSON 数据提取助手，只返回有效的 JSON 格式，不包含任何其他文字。" },
        { role: "user", content: analysisPrompt },
      ],
      {
        temperature: 0.3, // 降低温度以获得更稳定的 JSON 输出
        maxTokens: 1000,
        provider: "deepseek",
      }
    );

    // 解析 JSON 响应
    let analyzeData: AnalyzeResponse;
    try {
      // 清理可能的 markdown 代码块标记
      const cleaned = analysisResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analyzeData = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON 解析失败:", parseError);
      // 如果解析失败，返回默认值
      analyzeData = {
        stage: "planning",
        progress: 0.2,
      };
    }

    // 验证和规范化数据
    if (!analyzeData.stage) analyzeData.stage = "planning";
    if (typeof analyzeData.progress !== "number") analyzeData.progress = 0.2;
    if (!Array.isArray(analyzeData.skills)) analyzeData.skills = undefined;
    if (!Array.isArray(analyzeData.projects)) analyzeData.projects = undefined;

    return NextResponse.json(analyzeData);
  } catch (error) {
    console.error("分析 API 错误:", error);
    return NextResponse.json(
      {
        stage: "planning",
        progress: 0.0,
        intent_text: undefined,
        skills: [],
        projects: [],
      },
      { status: 500 }
    );
  }
}
```

---

## 步骤 5：安装依赖（如果未安装）

确保已安装 OpenAI SDK：

```bash
npm install openai
# 或
yarn add openai
# 或
pnpm add openai
```

**注意：** OpenAI SDK 同时支持 OpenAI 和 DeepSeek（通过设置 `baseURL`）。

---

## 步骤 6：测试验证

### 6.1 本地测试

1. 确保 `.env.local` 文件存在且包含有效的 API Key
2. 重启开发服务器：`npm run dev`
3. 在聊天页面发送消息
4. 检查控制台日志，确认 API 调用成功
5. 验证返回的回复是否来自真实模型

### 6.2 验证环境变量

在 API 路由中添加临时日志（仅用于调试）：

```typescript
console.log("API Key exists?", !!process.env.DEEPSEEK_API_KEY);
// 注意：不要打印完整的 API Key！
```

### 6.3 错误处理

确保处理以下错误情况：
- API Key 未配置
- API 调用失败（网络错误、配额超限等）
- JSON 解析失败（analyze API）
- 超时错误

---

## 步骤 7：生产环境部署

### 7.1 Vercel 部署

1. 在 Vercel Dashboard 中进入项目设置
2. 进入 "Environment Variables" 页面
3. 添加环境变量：
   - Key: `DEEPSEEK_API_KEY`
   - Value: 你的 API Key
   - Environment: Production, Preview, Development（根据需要选择）
4. 重新部署项目

### 7.2 其他平台

根据部署平台的不同，环境变量配置方式可能不同：
- **Netlify**: 在 Site settings → Environment variables 中配置
- **Railway**: 在 Variables 标签页中配置
- **自建服务器**: 在 `.env` 文件或系统环境变量中配置

---

## 注意事项

### ✅ 应该做的

1. ✅ 使用环境变量存储 API Key
2. ✅ 在服务器端（API 路由）调用 LLM
3. ✅ 添加错误处理和降级方案
4. ✅ 限制 API 调用频率（防止滥用）
5. ✅ 记录 API 调用日志（用于调试和监控）

### ❌ 不应该做的

1. ❌ 在前端代码中硬编码 API Key
2. ❌ 将 API Key 提交到 Git 仓库
3. ❌ 在客户端直接调用 LLM API
4. ❌ 在错误信息中暴露 API Key
5. ❌ 忽略 API 调用失败的情况

---

## 性能优化建议

1. **流式响应**：对于长文本回复，考虑使用流式输出提升用户体验
2. **缓存机制**：对于相同的问题，可以缓存回复（注意用户隐私）
3. **超时设置**：设置合理的请求超时时间
4. **重试机制**：对于网络错误，实现指数退避重试

---

## 示例：完整的 callLLM 实现（带错误处理）

```typescript
// lib/llm.ts
import OpenAI from "openai";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callLLM(
  messages: Message[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: "deepseek" | "openai";
    timeout?: number;
  }
): Promise<string> {
  const provider = options?.provider || "deepseek";
  const apiKey = provider === "deepseek" 
    ? process.env.DEEPSEEK_API_KEY 
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY not found in environment variables`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider === "deepseek" 
      ? "https://api.deepseek.com" 
      : undefined,
    timeout: options?.timeout || 30000, // 30秒超时
  });

  try {
    const completion = await client.chat.completions.create({
      model: options?.model || (provider === "deepseek" ? "deepseek-chat" : "gpt-3.5-turbo"),
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 500,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    return content;
  } catch (error: any) {
    // 详细的错误处理
    if (error.code === "insufficient_quota") {
      throw new Error("API 配额不足，请检查账户余额");
    } else if (error.code === "invalid_api_key") {
      throw new Error("API Key 无效，请检查环境变量配置");
    } else if (error.message?.includes("timeout")) {
      throw new Error("请求超时，请稍后重试");
    } else {
      console.error(`${provider} API 调用失败:`, error);
      throw new Error(`LLM API 调用失败: ${error.message || "未知错误"}`);
    }
  }
}
```

---

## 检查清单

在替换完成后，请确认：

- [ ] `.env.local` 文件已创建并包含有效的 API Key
- [ ] `.env.local` 已添加到 `.gitignore`
- [ ] `lib/llm.ts` 已创建并实现 `callLLM` 函数
- [ ] `/api/chat/route.ts` 已替换为真实 LLM 调用
- [ ] `/api/analyze/route.ts` 已替换为真实 LLM 调用
- [ ] 错误处理已实现
- [ ] 本地测试通过
- [ ] 生产环境环境变量已配置
- [ ] 没有在前端代码中暴露 API Key

---

## 参考资源

- [DeepSeek API 文档](https://platform.deepseek.com/api_docs)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [Next.js 环境变量文档](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [OpenAI Node.js SDK](https://github.com/openai/openai-node)

