/**
 * 对话存储 - 管理各阶段的独立对话历史
 */

import { UserStage } from "./stage";
import { generateMessageId } from "./utils";

export type ConversationMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: number;
  stage: UserStage;
};

export type StageConversations = {
  [stage in UserStage]: ConversationMessage[];
};

class ConversationStore {
  private conversations: StageConversations = {
    career_planning: [],
    project_review: [],
    resume_optimization: [],
    application_strategy: [],
    interview: [],
    salary_talk: [],
    offer: [],
  };
  private currentUserId: string | null = null;

  /**
   * 设置当前用户ID
   */
  setUserId(userId: string | null): void {
    this.currentUserId = userId;
    if (userId) {
      // 切换用户时，加载该用户的对话历史
      this.loadFromLocalStorage(userId);
    } else {
      // 清空当前对话历史
      this.clearAll();
    }
  }

  /**
   * 获取指定阶段的对话历史
   */
  getStageHistory(stage: UserStage): ConversationMessage[] {
    return this.conversations[stage] || [];
  }

  /**
   * 添加消息到指定阶段
   */
  addMessage(stage: UserStage, message: ConversationMessage): void {
    if (!this.conversations[stage]) {
      this.conversations[stage] = [];
    }
    // 检查是否已存在相同 ID 的消息（避免重复添加）
    const existing = this.conversations[stage].find((msg) => msg.id === message.id);
    if (!existing) {
      this.conversations[stage].push(message);
      // 保存到 localStorage
      if (this.currentUserId) {
        this.saveToLocalStorage(this.currentUserId);
      }
    }
  }

  /**
   * 获取所有阶段的对话历史（用于AI上下文）
   * 返回格式：{ role: "user" | "assistant", content: string }[]
   */
  getAllHistoryForStage(currentStage: UserStage): Array<{
    role: "user" | "assistant";
    content: string;
    stage?: UserStage; // 可选：标记消息来源阶段
  }> {
    const allHistory: Array<{
      role: "user" | "assistant";
      content: string;
      stage?: UserStage;
    }> = [];

    // 按阶段顺序遍历所有阶段
    const stages: UserStage[] = [
      "career_planning",
      "project_review",
      "resume_optimization",
      "application_strategy",
      "interview",
      "salary_talk",
      "offer",
    ];

    stages.forEach((stage) => {
      const messages = this.conversations[stage] || [];
      if (messages.length > 0) {
        // 添加阶段分隔标记（可选，帮助AI理解上下文）
        if (allHistory.length > 0) {
          allHistory.push({
            role: "assistant",
            content: `[阶段切换：${this.getStageName(stage)}]`,
            stage,
          });
        }

        // 添加该阶段的所有消息
        messages.forEach((msg) => {
          allHistory.push({
            role: msg.sender === "user" ? "user" : "assistant",
            content: msg.text,
            stage,
          });
        });
      }
    });

    return allHistory;
  }

  /**
   * 获取阶段名称（用于标记）
   */
  private getStageName(stage: UserStage): string {
    const names: Record<UserStage, string> = {
      career_planning: "职业规划",
      project_review: "项目梳理",
      resume_optimization: "简历优化",
      application_strategy: "投递策略",
      interview: "模拟面试",
      salary_talk: "薪资沟通",
      offer: "Offer",
    };
    return names[stage] || stage;
  }

  /**
   * 清空指定阶段的对话
   */
  clearStage(stage: UserStage): void {
    this.conversations[stage] = [];
    if (this.currentUserId) {
      this.saveToLocalStorage(this.currentUserId);
    }
  }

  /**
   * 清空所有对话
   */
  clearAll(): void {
    const stages: UserStage[] = [
      "career_planning",
      "project_review",
      "resume_optimization",
      "application_strategy",
      "interview",
      "salary_talk",
      "offer",
    ];
    stages.forEach((stage) => {
      this.conversations[stage] = [];
    });
    if (this.currentUserId) {
      this.saveToLocalStorage(this.currentUserId);
    }
  }

  /**
   * 清空指定用户的所有对话（用于退出登录）
   */
  clearUserData(userId: string): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`conversationStore_${userId}`);
      } catch (e) {
        console.error("清空用户对话历史失败:", e);
      }
    }
  }

  /**
   * 保存到 localStorage（基于用户ID）
   */
  private saveToLocalStorage(userId: string): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`conversationStore_${userId}`, JSON.stringify(this.conversations));
      } catch (e) {
        console.error("保存对话历史失败:", e);
      }
    }
  }

  /**
   * 从 localStorage 加载（基于用户ID）
   */
  loadFromLocalStorage(userId: string): void {
    if (typeof window !== "undefined") {
      try {
        // 先重置为空
        this.conversations = {
          career_planning: [],
          project_review: [],
          resume_optimization: [],
          application_strategy: [],
          interview: [],
          salary_talk: [],
          offer: [],
        };
        
        const saved = localStorage.getItem(`conversationStore_${userId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          // 合并保存的数据
          Object.keys(parsed).forEach((stage) => {
            if (this.conversations[stage as UserStage]) {
              this.conversations[stage as UserStage] = parsed[stage] || [];
            }
          });
        }
      } catch (e) {
        console.error("加载对话历史失败:", e);
      }
    }
  }

  /**
   * 初始化欢迎消息
   */
  initializeWelcomeMessage(stage: UserStage): void {
    const existing = this.conversations[stage];
    if (existing.length === 0) {
      // 直接添加到内存，不触发保存（避免在未设置userId时保存）
      const welcomeMessage: ConversationMessage = {
        id: generateMessageId(),
        sender: "ai",
        text: "你好！我是你的 AI 求职教练。我们将通过对话一步步搞定你的 Offer。首先，我们可以先聊聊你的职业规划，或者直接开始梳理项目？",
        timestamp: Date.now(),
        stage,
      };
      if (!this.conversations[stage]) {
        this.conversations[stage] = [];
      }
      this.conversations[stage].push(welcomeMessage);
      // 如果有用户ID，保存到 localStorage
      if (this.currentUserId) {
        this.saveToLocalStorage(this.currentUserId);
      }
    }
  }
}

// 导出单例
export const conversationStore = new ConversationStore();

