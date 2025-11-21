/**
 * 用户求职流程阶段定义
 * 用于控制 AI 引导用户完成求职流程的各个阶段
 */

export type UserStage =
  | "career_planning"      // 职业规划（意向岗位、求职方向）
  | "project_review"       // 项目梳理（STAR 深挖）
  | "resume_optimization"  // 简历优化
  | "application_strategy" // 投递策略
  | "interview"            // 模拟面试
  | "salary_talk"          // 薪资沟通
  | "offer";               // Offer

/**
 * 阶段顺序（按求职流程顺序）
 */
export const StageOrder: UserStage[] = [
  "career_planning",
  "project_review",
  "resume_optimization",
  "application_strategy",
  "interview",
  "salary_talk",
  "offer",
];

/**
 * 阶段中文名称映射
 */
export const StageNames: Record<UserStage, string> = {
  career_planning: "职业规划",
  project_review: "项目梳理",
  resume_optimization: "简历优化",
  application_strategy: "投递策略",
  interview: "模拟面试",
  salary_talk: "薪资沟通",
  offer: "Offer",
};

/**
 * 阶段描述（用于 AI prompt）
 */
export const StageDescriptions: Record<UserStage, string> = {
  career_planning: "引导用户明确职业方向，确定目标岗位和求职意向",
  project_review: "按照 STAR 格式帮助用户梳理项目经历，深挖项目细节、成果和影响",
  resume_optimization: "提供简历填写或优化建议，突出核心技能和项目成果",
  application_strategy: "制定简历投递策略，匹配目标岗位要求",
  interview: "进行模拟面试并给出回答建议，提升面试表现",
  salary_talk: "制定薪资谈判策略，帮助用户获得理想薪资",
  offer: "协助用户评估和选择 offer，提供决策建议",
};

/**
 * 获取下一个阶段
 * @param current 当前阶段
 * @returns 下一个阶段，如果已经是最后一个阶段则返回 null
 */
export function getNextStage(current: UserStage): UserStage | null {
  const idx = StageOrder.indexOf(current);
  if (idx === -1 || idx === StageOrder.length - 1) return null;
  return StageOrder[idx + 1];
}

/**
 * 获取上一个阶段
 * @param current 当前阶段
 * @returns 上一个阶段，如果已经是第一个阶段则返回 null
 */
export function getPrevStage(current: UserStage): UserStage | null {
  const idx = StageOrder.indexOf(current);
  if (idx <= 0) return null;
  return StageOrder[idx - 1];
}

/**
 * 验证阶段是否有效
 * @param stage 待验证的阶段
 * @returns 是否为有效阶段
 */
export function isValidStage(stage: string): stage is UserStage {
  return StageOrder.includes(stage as UserStage);
}

