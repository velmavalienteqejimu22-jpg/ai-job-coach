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
      : undefined, // OpenAI 使用默认 baseURL
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

