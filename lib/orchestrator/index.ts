/**
 * 多模型编排器
 * 根据用户当前阶段自动选择对应的模型
 */

import { UserStage } from "@/lib/stage";
import { runDeepSeekCareer, CareerPlanningResult } from "./models/career_planning";
import { runDeepSeekProjectReview, ProjectReviewResult } from "./models/project_review";
import { runDeepSeekResume, ResumeOptimizationResult } from "./models/resume_optimization";
import { runDeepSeekStrategy, ApplicationStrategyResult } from "./models/application_strategy";
import { runDeepSeekInterview, InterviewResult } from "./models/interview";
import { runDeepSeekSalary, SalaryTalkResult } from "./models/salary_talk";
import { runDeepSeekOffer, OfferResult } from "./models/offer";

export type OrchestratorResult = {
  reply: string;
  structured: any; // 白板数据结构
};

export type OrchestratorInput = {
  userStage: UserStage;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

/**
 * 运行编排器，根据阶段选择对应的模型
 */
export async function runOrchestrator({
  userStage,
  messages,
}: OrchestratorInput): Promise<OrchestratorResult> {
  let result: OrchestratorResult;

  switch (userStage) {
    case "career_planning": {
      const careerResult = await runDeepSeekCareer(messages);
      result = {
        reply: careerResult.reply,
        structured: careerResult.structured,
      };
      break;
    }

    case "project_review": {
      const projectResult = await runDeepSeekProjectReview(messages);
      result = {
        reply: projectResult.reply,
        structured: projectResult.structured,
      };
      break;
    }

    case "resume_optimization": {
      const resumeResult = await runDeepSeekResume(messages);
      result = {
        reply: resumeResult.reply,
        structured: resumeResult.structured,
      };
      break;
    }

    case "application_strategy": {
      const strategyResult = await runDeepSeekStrategy(messages);
      result = {
        reply: strategyResult.reply,
        structured: strategyResult.structured,
      };
      break;
    }

    case "interview": {
      const interviewResult = await runDeepSeekInterview(messages);
      result = {
        reply: interviewResult.reply,
        structured: interviewResult.structured,
      };
      break;
    }

    case "salary_talk": {
      const salaryResult = await runDeepSeekSalary(messages);
      result = {
        reply: salaryResult.reply,
        structured: salaryResult.structured,
      };
      break;
    }

    case "offer": {
      const offerResult = await runDeepSeekOffer(messages);
      result = {
        reply: offerResult.reply,
        structured: offerResult.structured,
      };
      break;
    }

    default: {
      // 默认使用职业规划模型
      const careerResult = await runDeepSeekCareer(messages);
      result = {
        reply: careerResult.reply,
        structured: careerResult.structured,
      };
    }
  }

  return result;
}

