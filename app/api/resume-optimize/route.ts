import { NextResponse } from "next/server";
import OpenAI from "openai";

async function callDeepSeek(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY not found");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const completion = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    temperature: 0.7,
    max_tokens: 600,
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "缺少文件字段 file" }, { status: 400 });
    }

    // 仅支持 txt（按需可扩展 pdf/docx）
    const filename = (file as File).name?.toLowerCase?.() || "";
    const isTxt = filename.endsWith(".txt") || (file as any).type === "text/plain";
    if (!isTxt) {
      return NextResponse.json({ error: "目前仅支持 txt 文件" }, { status: 400 });
    }

    // 读取文本内容
    const resumeText = await (file as File).text();
    const trimmed = resumeText.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
    }

    // 可选：限制长度，避免超长输入
    const input = trimmed.length > 8000 ? trimmed.slice(0, 8000) : trimmed;

    const systemPrompt = "你是一名资深简历优化顾问，请基于用户简历内容，生成 3 点具体优化建议（突出结果导向、量化成果、关键词匹配）。输出应清晰简洁。";
    const userPrompt = `以下是用户的简历文本，请基于其内容给出恰当的优化建议（严格 3 点，使用条目列表）：\n\n${input}`;

    const suggestions = await callDeepSeek([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("/api/resume-optimize 错误:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}


