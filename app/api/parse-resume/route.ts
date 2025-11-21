import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { saveResume, saveWhiteboard, getDbClient } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * 使用正则表达式初步分段简历内容
 * 匹配关键字：教育、项目、技能、工作等
 */
function preSegmentText(text: string): {
  segments: Array<{ type: string; text: string }>;
  rawText: string;
} {
  const segments: Array<{ type: string; text: string }> = [];
  
  // 定义分段模式（关键字匹配）
  const patterns = [
    { type: "教育", keywords: ["教育", "学历", "学校", "毕业", "专业", "学位", "本科", "硕士", "博士", "大学", "学院"] },
    { type: "工作", keywords: ["工作", "经历", "经验", "公司", "职位", "岗位", "实习", "任职", "就职"] },
    { type: "项目", keywords: ["项目", "作品", "案例", "开发", "设计", "实现"] },
    { type: "技能", keywords: ["技能", "能力", "特长", "精通", "熟悉", "掌握", "技术栈", "工具"] },
    { type: "证书", keywords: ["证书", "认证", "资格", "执照", "资质"] },
    { type: "语言", keywords: ["语言", "外语", "英语", "日语", "法语", "德语", "四级", "六级", "雅思", "托福"] },
  ];

  // 按段落分割文本
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  // 按关键字分组段落
  paragraphs.forEach((para, index) => {
    const paraText = para.trim();
    if (!paraText) return;

    // 检查段落是否包含关键字
    let matchedType: string | null = null;
    for (const pattern of patterns) {
      if (pattern.keywords.some(keyword => paraText.includes(keyword))) {
        matchedType = pattern.type;
        break;
      }
    }

    if (matchedType) {
      segments.push({ type: matchedType, text: paraText });
    } else if (index === 0) {
      // 第一段通常是个人信息或摘要
      segments.push({ type: "个人信息", text: paraText });
    } else {
      // 其他未分类段落
      segments.push({ type: "其他", text: paraText });
    }
  });

  return { segments, rawText: text };
}

/**
 * 解析简历文件（支持 PDF、DOCX、TXT）
 * 返回结构化的简历信息
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string | null;
    const sessionId = formData.get("sessionId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "缺少文件字段 file" }, { status: 400 });
    }

    const filename = file.name?.toLowerCase() || "";
    const ext = filename.split(".").pop() || "";

    // 读取文件内容
    let fileContent = "";
    let fileType = "";
    
    if (ext === "txt" || file.type === "text/plain") {
      // 文本文件直接读取
      fileContent = await file.text();
      fileType = "text";
    } else if (ext === "pdf") {
      // PDF 文件：使用 pdf-parse 解析
      try {
        const pdfParse = await import("pdf-parse");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdfParse.default(buffer);
        fileContent = data.text;
        fileType = "pdf";
      } catch (error: any) {
        console.error("PDF 解析失败:", error);
        // 检查是否是 stub 模式（没有安装依赖）
        if (error.code === "MODULE_NOT_FOUND") {
          return NextResponse.json({
            error: "PDF 解析功能需要安装 pdf-parse 依赖",
            message: "请运行: npm install pdf-parse",
          }, { status: 503 });
        }
        return NextResponse.json({ error: "PDF 文件解析失败，请确保文件格式正确" }, { status: 400 });
      }
    } else if (ext === "docx" || ext === "doc") {
      // DOCX 文件：使用 mammoth 解析
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const result = await mammoth.extractRawText({ buffer });
        fileContent = result.value;
        fileType = "docx";
      } catch (error: any) {
        console.error("DOCX 解析失败:", error);
        // 检查是否是 stub 模式（没有安装依赖）
        if (error.code === "MODULE_NOT_FOUND") {
          return NextResponse.json({
            error: "DOCX 解析功能需要安装 mammoth 依赖",
            message: "请运行: npm install mammoth",
          }, { status: 503 });
        }
        return NextResponse.json({ error: "DOCX 文件解析失败，请确保文件格式正确" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "不支持的文件格式，请上传 .pdf、.docx 或 .txt 文件" }, { status: 400 });
    }

    if (!fileContent || fileContent.trim().length === 0) {
      return NextResponse.json({ error: "文件内容为空或无法提取文本" }, { status: 400 });
    }

    // 初步分段
    const { segments, rawText } = preSegmentText(fileContent);
    const preSegmentsText = segments.map(s => `[${s.type}]\n${s.text}`).join("\n\n");

    // 构建解析提示词
    const parsePrompt = `你是一个专业的简历解析助手。请仔细阅读以下简历文本内容，提取所有信息，并严格按照以下 JSON 格式返回：

{
  "summary": "个人简介/自我评价（简要总结）",
  "skills": ["技能1", "技能2", "技能3"],
  "education": [
    {
      "school": "学校名称",
      "degree": "学历（本科/硕士/博士）",
      "time": "时间（如：2018-2022）",
      "text": "详细描述（专业、成绩等）"
    }
  ],
  "experiences": [
    {
      "company": "公司名称",
      "title": "职位名称",
      "time": "时间（如：2020-2023）",
      "text": "工作描述（职责、成果等）"
    }
  ],
  "projects": [
    {
      "title": "项目名称",
      "role": "角色（如：负责人/参与）",
      "start": "开始时间（如：2023-01）",
      "end": "结束时间（如：2023-12 或 至今）",
      "text": "项目描述（背景、技术栈、成果等）"
    }
  ]
}

要求：
1. 只返回 JSON，不要包含其他文字或 markdown 代码块标记
2. 如果某个字段没有信息，返回空数组 [] 或空字符串 ""
3. 尽量提取完整的信息
4. summary 字段要简洁（50-100字）

简历文本内容（已初步分段）：
${preSegmentsText}

原始完整文本：
${rawText}

请返回 JSON 格式：`;

    // 调用 LLM 解析
    let parsedData: any = {};
    
    // 检查是否有 API key（stub 模式）
    const hasApiKey = !!process.env.DEEPSEEK_API_KEY;
    
    if (hasApiKey) {
      try {
        const response = await callLLM(
          [
            {
              role: "system",
              content: "你是一个专业的 JSON 数据提取助手，只返回有效的 JSON 格式，不包含任何其他文字、注释或 markdown 代码块标记。严格按照用户要求的格式返回。",
            },
            { role: "user", content: parsePrompt },
          ],
          {
            temperature: 0.3,
            maxTokens: 4000,
            provider: "deepseek",
          }
        );

        // 解析 JSON 响应
        try {
          // 清理可能的 markdown 代码块标记
          const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("无法找到 JSON 内容");
          }
        } catch (parseError) {
          console.error("JSON 解析失败:", parseError);
          throw new Error("AI 返回的 JSON 格式不正确");
        }
      } catch (llmError: any) {
        console.error("LLM 调用失败:", llmError);
        // LLM 调用失败时，返回基础结构
        parsedData = {
          summary: "",
          skills: [],
          education: [],
          experiences: [],
          projects: [],
        };
      }
    } else {
      // Stub 模式：返回模拟数据
      parsedData = {
        summary: "这是一个示例解析结果。请配置 DEEPSEEK_API_KEY 环境变量以使用真实的 AI 解析功能。",
        skills: ["示例技能1", "示例技能2"],
        education: [
          {
            school: "示例大学",
            degree: "本科",
            time: "2018-2022",
            text: "示例专业",
          },
        ],
        experiences: [
          {
            company: "示例公司",
            title: "示例职位",
            time: "2022-2024",
            text: "示例工作描述",
          },
        ],
        projects: [
          {
            title: "示例项目",
            role: "负责人",
            start: "2023-01",
            end: "2023-12",
            text: "示例项目描述",
          },
        ],
      };
    }

    // 添加原始文本到解析结果
    const finalResult = {
      ...parsedData,
      rawText: rawText,
      preSegments: segments,
    };

    // 保存到数据库（如果有数据库和用户ID/会话ID）
    if (userId && sessionId) {
      try {
        const client = await getDbClient();
        if (client) {
          // 保存简历到数据库
          const resumeId = await saveResume(userId, sessionId, {
            rawText: rawText,
            parsed: parsedData,
          });

          // 更新白板状态（获取现有白板数据并合并）
          try {
            const { getWhiteboard } = await import("@/lib/db");
            const existingWhiteboard = await getWhiteboard(sessionId);
            const updatedWhiteboard = {
              ...existingWhiteboard,
              resumeInsights: parsedData,
              projects: parsedData.projects || [],
            };
            await saveWhiteboard(sessionId, updatedWhiteboard);
          } catch (wbError) {
            console.error("更新白板状态失败:", wbError);
          }

          // 添加 resumeId 到返回结果
          (finalResult as any).resumeId = resumeId;
        }
      } catch (dbError) {
        console.error("保存到数据库失败:", dbError);
        // 数据库保存失败不影响返回结果
      }
    }

    return NextResponse.json(finalResult);
  } catch (error: any) {
    console.error("解析简历失败:", error);
    return NextResponse.json(
      {
        error: "服务器内部错误",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
