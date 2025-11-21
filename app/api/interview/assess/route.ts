import { NextResponse } from "next/server";

type RequestBody = {
  round: string;
  question: string;
  answer: string;
};

type AssessmentResponse = {
  score: number; // 总分 0-100
  breakdown: {
    accuracy: number; // 准确性 0-100
    completeness: number; // 完整性 0-100
    logic: number; // 逻辑性 0-100
    communication: number; // 表达清晰度 0-100
  };
  feedback: {
    strengths: string[]; // 优点
    improvements: string[]; // 改进建议
    overall: string; // 总体评价
  };
  tips?: {
    intent: string; // 考察意图
    keypoints: string[]; // 回答要点
  };
};

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json().catch(() => ({}));
    const { round, question, answer } = body;

    // 模拟处理延迟 800ms
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 简单的评分逻辑（基于回答长度和关键词）
    const answerLength = answer.length;
    const hasKeywords = (text: string, keywords: string[]) => {
      const lower = text.toLowerCase();
      return keywords.some((kw) => lower.includes(kw.toLowerCase()));
    };

    // 根据问题类型判断关键词
    let relevantKeywords: string[] = [];
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes("项目") || lowerQuestion.includes("project")) {
      relevantKeywords = ["目标", "负责", "结果", "成果", "影响", "数据"];
    } else if (lowerQuestion.includes("用户") || lowerQuestion.includes("洞察")) {
      relevantKeywords = ["用户", "需求", "调研", "分析", "方案", "验证"];
    } else if (lowerQuestion.includes("数据") || lowerQuestion.includes("决策")) {
      relevantKeywords = ["数据", "指标", "实验", "分析", "结论", "决策"];
    }

    // 计算各项分数
    const accuracy = Math.min(100, 60 + (hasKeywords(answer, relevantKeywords) ? 30 : 0) + Math.min(10, answerLength / 50));
    const completeness = Math.min(100, 50 + Math.min(30, answerLength / 30) + (answerLength > 100 ? 20 : 0));
    const logic = Math.min(100, 70 + (answerLength > 150 ? 20 : 0) + (hasKeywords(answer, ["首先", "然后", "最后", "因为", "所以"]) ? 10 : 0));
    const communication = Math.min(100, 65 + Math.min(25, answerLength / 40) + (answerLength > 80 ? 10 : 0));

    const score = Math.round((accuracy + completeness + logic + communication) / 4);

    // 生成反馈
    const strengths: string[] = [];
    const improvements: string[] = [];

    if (answerLength > 150) {
      strengths.push("回答较为详细，展现了良好的表达能力");
    } else {
      improvements.push("可以增加更多细节和具体案例");
    }

    if (hasKeywords(answer, relevantKeywords)) {
      strengths.push("回答切题，抓住了关键点");
    } else {
      improvements.push("建议更紧密地围绕问题核心展开");
    }

    if (answerLength < 50) {
      improvements.push("回答过于简短，建议补充更多信息");
    }

    if (strengths.length === 0) {
      strengths.push("回答结构清晰");
    }

    if (improvements.length === 0) {
      improvements.push("可以进一步优化表达方式");
    }

    const overall = score >= 80 
      ? "回答质量优秀，展现了良好的专业能力和沟通技巧。"
      : score >= 60
      ? "回答基本符合要求，但仍有提升空间。"
      : "回答需要进一步完善，建议多练习和准备。";

    // 生成 Tips
    let intent = "考察候选人的专业能力和思维逻辑";
    let keypoints: string[] = ["清晰表达", "逻辑完整", "具体案例"];

    if (lowerQuestion.includes("项目")) {
      intent = "考察项目管理和执行能力，以及结果导向思维";
      keypoints = ["项目背景", "个人职责", "关键成果", "数据指标", "复盘反思"];
    } else if (lowerQuestion.includes("用户") || lowerQuestion.includes("洞察")) {
      intent = "考察用户研究和产品洞察能力";
      keypoints = ["用户需求发现", "研究方法", "洞察提炼", "方案落地", "效果验证"];
    } else if (lowerQuestion.includes("数据")) {
      intent = "考察数据分析和决策能力";
      keypoints = ["指标定义", "实验设计", "数据分析", "结论推导", "决策落地"];
    }

    const response: AssessmentResponse = {
      score,
      breakdown: {
        accuracy,
        completeness,
        logic,
        communication,
      },
      feedback: {
        strengths,
        improvements,
        overall,
      },
      tips: {
        intent,
        keypoints,
      },
    };

    console.log("面试评估结果:", JSON.stringify(response, null, 2));

    return NextResponse.json(response);
  } catch (error) {
    console.error("评估 API 错误:", error);
    return NextResponse.json(
      {
        score: 0,
        breakdown: {
          accuracy: 0,
          completeness: 0,
          logic: 0,
          communication: 0,
        },
        feedback: {
          strengths: [],
          improvements: ["评估过程中出现错误"],
          overall: "评估失败，请稍后重试",
        },
      },
      { status: 500 }
    );
  }
}

