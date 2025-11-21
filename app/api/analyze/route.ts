import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { UserStage, StageNames, isValidStage } from "@/lib/stage";
import { saveWhiteboard } from "@/lib/db";

type Message = {
  role?: "user" | "assistant" | "system";
  content: string;
  isUser?: boolean;
  [key: string]: any;
};

type RequestBody = {
  messages?: Message[];
  userStage?: UserStage | string;
  sessionId?: string;
};

// 白板数据结构
type WhiteboardData = {
  // career_planning 阶段
  intentRole?: string;           // 意向岗位
  keySkills?: string[];          // 核心技能
  
  // project_review 阶段
  starProjects?: Array<{         // STAR 项目
    id: string;
    title: string;
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
    createdAt?: string;
  }>;
  
  // resume_optimization 阶段
  resumeInsights?: Array<{        // 简历优化建议
    id: string;
    original?: string;           // 原句
    optimized?: string;          // 优化后
    suggestion?: string;          // 优化建议
    section?: string;            // 所属部分（如：工作经历、项目经历）
  }>;
  
  // interview 阶段
  interviewReports?: Array<{     // 面试报告
    id: string;
    round: string;              // 轮次
    questions?: Array<{          // 问题列表
      question: string;
      userAnswer?: string;
      aiFeedback?: string;
      score?: number;
    }>;
    overallScore?: number;       // 总分
    strengths?: string[];        // 优点
    improvements?: string[];     // 改进建议
    createdAt?: string;
  }>;
  
  // application_strategy 阶段
  targetCompanies?: Array<{      // 目标公司
    name: string;
    position: string;
    matchScore?: number;         // 匹配度
    notes?: string;
  }>;
  
  // salary_talk 阶段
  salaryStrategy?: {             // 薪资策略
    targetRange?: string;        // 目标薪资范围
    negotiationPoints?: string[]; // 谈判要点
    marketData?: string;         // 市场数据
  };
  
  // offer 阶段
  offers?: Array<{               // Offer 列表
    company: string;
    position: string;
    salary?: string;
    benefits?: string[];
    pros?: string[];
    cons?: string[];
  }>;
};

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json().catch(() => ({}));
    const { messages = [], userStage, sessionId } = body;

    // 验证并规范化 userStage
    let currentStage: UserStage = "career_planning";
    if (userStage && isValidStage(userStage)) {
      currentStage = userStage;
    } else if (typeof userStage === "string") {
      // 尝试映射
      const stageMap: Record<string, UserStage> = {
        career: "career_planning",
        project: "project_review",
        resume: "resume_optimization",
        apply: "application_strategy",
        interview: "interview",
        salary: "salary_talk",
        offer: "offer",
      };
      currentStage = stageMap[userStage.toLowerCase()] || "career_planning";
    }

    const stageName = StageNames[currentStage];

    // 根据阶段构建不同的分析提示词
    let analysisPrompt = "";
    let expectedFields: string[] = [];

    switch (currentStage) {
      case "career_planning":
        analysisPrompt = `从对话中提取职业规划相关信息，只返回 JSON，不要包含任何其他文字。

提取字段：
- intentRole: 用户的意向岗位（字符串，如"产品经理"、"前端开发工程师"，如果没有则返回 null）
- keySkills: 用户提到的核心技能（字符串数组，如["React", "TypeScript"]，如果没有则返回空数组 []）

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON，不要 markdown）：
{
  "intentRole": "岗位名称或null",
  "keySkills": ["技能1", "技能2"]
}`;
        expectedFields = ["intentRole", "keySkills"];
        break;

      case "project_review":
        analysisPrompt = `从对话中提取 STAR 格式的项目信息，只返回 JSON，不要包含任何其他文字。

提取字段：
- starProjects: 项目数组，每个项目包含：
  - title: 项目名称
  - situation: 项目背景/情境（可选）
  - task: 任务/目标（可选）
  - action: 行动/方法（可选）
  - result: 结果/成果（可选）

注意：
- 只提取完整或部分 STAR 结构的项目
- 如果用户提到新项目，添加到数组中
- 如果项目信息不完整，只返回已有字段

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{
  "starProjects": [
    {
      "title": "项目名称",
      "situation": "背景描述或null",
      "task": "任务描述或null",
      "action": "行动描述或null",
      "result": "结果描述或null"
    }
  ]
}`;
        expectedFields = ["starProjects"];
        break;

      case "resume_optimization":
        analysisPrompt = `从对话中提取简历优化建议，只返回 JSON，不要包含任何其他文字。

提取字段：
- resumeInsights: 优化建议数组，每个建议包含：
  - original: 原始文本（如果有）
  - optimized: 优化后的文本（如果有）
  - suggestion: 优化建议说明
  - section: 所属部分（如"工作经历"、"项目经历"、"自我评价"）

注意：
- 只提取明确的优化建议
- 如果用户提供了原句和优化句，都要提取
- 如果没有优化建议，返回空数组

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{
  "resumeInsights": [
    {
      "original": "原句或null",
      "optimized": "优化后或null",
      "suggestion": "建议说明",
      "section": "所属部分"
    }
  ]
}`;
        expectedFields = ["resumeInsights"];
        break;

      case "interview":
        analysisPrompt = `从对话中提取面试相关信息，只返回 JSON，不要包含任何其他文字。

提取字段：
- interviewReports: 面试报告数组，每个报告包含：
  - round: 轮次（如"第一轮"、"技术面"）
  - questions: 问题列表，每个问题包含：
    - question: 问题内容
    - userAnswer: 用户回答（如果有）
    - aiFeedback: AI 反馈（如果有）
    - score: 评分 0-100（如果有）
  - overallScore: 总体评分 0-100（可选）
  - strengths: 优点列表（字符串数组）
  - improvements: 改进建议列表（字符串数组）

注意：
- 如果完成了一轮面试，生成一个完整的报告
- 如果只是部分信息，只返回已有字段
- 如果没有面试信息，返回空数组

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{
  "interviewReports": [
    {
      "round": "轮次名称",
      "questions": [
        {
          "question": "问题内容",
          "userAnswer": "用户回答或null",
          "aiFeedback": "反馈或null",
          "score": 85
        }
      ],
      "overallScore": 80,
      "strengths": ["优点1"],
      "improvements": ["建议1"]
    }
  ]
}`;
        expectedFields = ["interviewReports"];
        break;

      case "application_strategy":
        analysisPrompt = `从对话中提取投递策略相关信息，只返回 JSON，不要包含任何其他文字。

提取字段：
- targetCompanies: 目标公司列表，每个公司包含：
  - name: 公司名称
  - position: 岗位名称
  - matchScore: 匹配度 0-100（可选）
  - notes: 备注（可选）

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{
  "targetCompanies": [
    {
      "name": "公司名称",
      "position": "岗位名称",
      "matchScore": 85,
      "notes": "备注或null"
    }
  ]
}`;
        expectedFields = ["targetCompanies"];
        break;

      case "salary_talk":
        analysisPrompt = `从对话中提取薪资谈判策略，只返回 JSON，不要包含任何其他文字。

提取字段：
- salaryStrategy: 薪资策略对象，包含：
  - targetRange: 目标薪资范围（如"15k-20k"）
  - negotiationPoints: 谈判要点列表（字符串数组）
  - marketData: 市场数据/参考信息（可选）

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{
  "salaryStrategy": {
    "targetRange": "薪资范围或null",
    "negotiationPoints": ["要点1", "要点2"],
    "marketData": "市场数据或null"
  }
}`;
        expectedFields = ["salaryStrategy"];
        break;

      case "offer":
        analysisPrompt = `从对话中提取 Offer 信息，只返回 JSON，不要包含任何其他文字。

提取字段：
- offers: Offer 列表，每个 Offer 包含：
  - company: 公司名称
  - position: 岗位名称
  - salary: 薪资（可选）
  - benefits: 福利列表（字符串数组，可选）
  - pros: 优点列表（字符串数组，可选）
  - cons: 缺点列表（字符串数组，可选）

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{
  "offers": [
    {
      "company": "公司名称",
      "position": "岗位名称",
      "salary": "薪资或null",
      "benefits": ["福利1"],
      "pros": ["优点1"],
      "cons": ["缺点1"]
    }
  ]
}`;
        expectedFields = ["offers"];
        break;

      default:
        analysisPrompt = `从对话中提取关键信息，只返回 JSON，不要包含任何其他文字。

对话内容：
${messages.map((msg, i) => `${msg.role || (msg.isUser ? "user" : "assistant")}: ${msg.content}`).join("\n")}

返回格式（严格 JSON）：
{}`;
        expectedFields = [];
    }

    // 调用 LLM 进行分析
    const analysisResult = await callLLM(
      [
        {
          role: "system",
          content: `你是专业的数据提取助手。当前阶段：${stageName}（${currentStage}）。

【重要约束】
1. 你必须严格输出 JSON 格式，不要包含任何其他文字
2. 禁止在 JSON 前后添加 markdown 代码块标记（如 \`\`\`json）
3. 字段缺失则不返回该字段或设为 null/空数组
4. 只返回当前阶段（${currentStage}）对应的字段：${expectedFields.join(", ") || "无特定字段"}
5. 如果对话中没有相关信息，返回空对象 {} 或对应字段为 null/空数组`,
        },
        { role: "user", content: analysisPrompt },
      ],
      {
        temperature: 0.2, // 降低温度以获得更稳定的 JSON 输出
        maxTokens: 1500,
        provider: "deepseek",
      }
    );

    // 解析 JSON 响应
    let whiteboardData: WhiteboardData = {};
    try {
      // 清理可能的 markdown 代码块标记
      const cleaned = analysisResult
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // 尝试提取 JSON
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        whiteboardData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("未找到 JSON 格式");
      }
    } catch (parseError) {
      console.error("JSON 解析失败:", parseError);
      console.error("原始响应:", analysisResult);
      // 解析失败时返回空对象
      return NextResponse.json({});
    }

    // 验证和规范化数据
    // 为数组字段添加 ID（如果没有）
    if (whiteboardData.starProjects) {
      whiteboardData.starProjects = whiteboardData.starProjects.map((project, idx) => ({
        ...project,
        id: project.id || `project_${Date.now()}_${idx}`,
        createdAt: project.createdAt || new Date().toISOString(),
      }));
    }

    if (whiteboardData.resumeInsights) {
      whiteboardData.resumeInsights = whiteboardData.resumeInsights.map((insight, idx) => ({
        ...insight,
        id: insight.id || `insight_${Date.now()}_${idx}`,
      }));
    }

    if (whiteboardData.interviewReports) {
      whiteboardData.interviewReports = whiteboardData.interviewReports.map((report, idx) => ({
        ...report,
        id: report.id || `interview_${Date.now()}_${idx}`,
        createdAt: report.createdAt || new Date().toISOString(),
      }));
    }

    if (whiteboardData.offers) {
      whiteboardData.offers = whiteboardData.offers.map((offer, idx) => ({
        ...offer,
        id: `offer_${Date.now()}_${idx}`,
      }));
    }

    // 开发调试日志
    console.log("=== Analyze API ===");
    console.log("当前阶段:", currentStage);
    console.log("输入消息数量:", messages.length);
    console.log("白板数据:", JSON.stringify(whiteboardData, null, 2));
    console.log("==================");

    // 异步保存白板数据（不阻塞响应）
    if (sessionId && Object.keys(whiteboardData).length > 0) {
      saveWhiteboard(sessionId, whiteboardData).catch(err => {
        console.error('保存白板数据失败:', err);
        // 不抛出错误，避免影响响应
      });
    }

    return NextResponse.json(whiteboardData);
  } catch (error) {
    console.error("分析 API 错误:", error);
    return NextResponse.json({}, { status: 500 });
  }
}
