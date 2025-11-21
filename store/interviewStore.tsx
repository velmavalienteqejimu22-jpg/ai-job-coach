/**
 * 模拟面试全局状态管理器
 * 使用 React Context 管理面试流程的状态和操作
 * 不依赖 zustand，使用原生 React Context API
 */

"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type InterviewMode = 'mock' | 'review' | null;
export type InterviewFlowStep =
  | 'idle'
  | 'awaitingMode'
  | 'awaitingRole'
  | 'awaitingRound'
  | 'awaitingCount'
  | 'ready'
  | 'review';
export type InterviewMessageRole = 'assistant' | 'user';

export interface InterviewMessage {
  id: string;
  role: InterviewMessageRole;
  content: string;
  timestamp: number;
}

const makeId = (prefix = 'msg'): string => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

// 面试轮次类型
export type RoundType = '业务面' | '项目深挖' | '技术面' | 'HR面' | '总监面' | null;

// 问题状态
export type QuestionStatus = 'pending' | 'answered' | 'evaluated';

// 问题提示信息
export interface QuestionTips {
  intent: string; // 考察意图
  keyPoints: string[]; // 关键要点
  framework: string; // 回答框架
  industryNotes?: string; // 行业知识
  pitfalls?: string[]; // 常见陷阱
  proTips?: string[]; // 专业建议
}

// 问题评估结果
export interface QuestionEvaluation {
  accuracy: number; // 准确性评分 (0-100)
  detail: number; // 详细度评分 (0-100)
  logic: number; // 逻辑性评分 (0-100)
  confidence: number; // 自信度评分 (0-100)
  tips: string; // 改进建议
}

// 面试问题
export interface InterviewQuestion {
  id: string;
  q: string; // 问题内容
  tips: QuestionTips; // 提示信息
  userAnswer?: string; // 用户回答
  evaluation?: QuestionEvaluation; // 评估结果
  status: QuestionStatus; // 问题状态
}

// 历史记录
export interface InterviewHistory {
  roundType: string;
  timestamp: number;
  reportId: string;
}

// Store 状态接口
export interface InterviewStore {
  // 基础信息
  sessionId: string | null;
  userId: string | null;

  // 当前轮次信息
  roundType: RoundType;
  roundIndex: number; // 当前轮次编号，从 0 开始
  currentQuestionIndex: number; // 当前问题索引

  // 问题列表
  questions: InterviewQuestion[];

  // 轮次状态
  roundCompleted: boolean;

  // 历史记录
  history: InterviewHistory[];

  // 对话与引导
  conversation: InterviewMessage[];
  flowStep: InterviewFlowStep;
  mode: InterviewMode;
  targetRole: string | null;
  totalQuestions: number | null;
  latestSummary: any;
  isLoadingQuestion: boolean;
  isEvaluating: boolean;

  // ========== 方法 ==========

  /**
   * 初始化面试会话
   * @param sessionId 会话ID
   * @param userId 用户ID
   * @param suggestedRound 建议的轮次类型（可选）
   */
  initInterview: (
    sessionId: string,
    userId: string,
    suggestedRound?: RoundType
  ) => void;

  /**
   * 加载指定轮次的面试
   * 清空当前问题，调用后端 API 获取新问题
   * @param roundType 轮次类型
   */
  loadRound: (roundType: RoundType) => Promise<void>;

  /**
   * 回答当前问题
   * 本地写入用户回答，并调用后端 API
   * @param questionId 问题ID
   * @param text 用户回答文本
   */
  answerQuestion: (questionId: string, text: string) => Promise<void>;

  /**
   * 设置问题评估结果
   * @param questionId 问题ID
   * @param evaluationData 评估数据
   */
  setEvaluation: (questionId: string, evaluationData: QuestionEvaluation) => void;

  /**
   * 跳转到下一题
   * 如果超过问题总数，则标记轮次完成
   */
  nextQuestion: () => Promise<void>;

  /**
   * 返回上一题
   */
  prevQuestion: () => void;

  /**
   * 重置当前题目的回答
   */
  retryCurrentQuestion: () => void;

  /**
   * 完成当前轮次，生成总结
   */
  completeRound: () => Promise<void>;

  /**
   * 重置当前轮次
   * 清空所有问题、状态、轮次信息
   */
  resetRound: () => void;

  /**
   * 获取当前问题
   * @returns 当前问题对象，如果不存在则返回 null
   */
  getCurrentQuestion: () => InterviewQuestion | null;

  // ==== 新增：引导对话相关方法 ====
  beginInterviewIntro: (context: {
    intentRole?: string | null;
    projectNames?: string[];
  }) => void;
  addAssistantMessage: (content: string) => string;
  addUserMessage: (content: string) => string;
  setMode: (mode: InterviewMode) => void;
  setFlowStep: (step: InterviewFlowStep) => void;
  setTargetRole: (role: string | null) => void;
  setTotalQuestions: (count: number | null) => void;
  setRound: (round: RoundType) => void;
  resetInterviewConversation: () => void;
}

// 创建 Context
const InterviewContext = createContext<InterviewStore | null>(null);

// Provider 组件
export function InterviewProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roundType, setRoundType] = useState<RoundType>(null);
  const [roundIndex, setRoundIndex] = useState<number>(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [roundCompleted, setRoundCompleted] = useState<boolean>(false);
  const [history, setHistory] = useState<InterviewHistory[]>([]);
  const [conversation, setConversation] = useState<InterviewMessage[]>([]);
  const [flowStep, setFlowStepState] = useState<InterviewFlowStep>('idle');
  const [mode, setModeState] = useState<InterviewMode>(null);
  const [targetRole, setTargetRoleState] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestionsState] = useState<number | null>(null);
  const [latestSummary, setLatestSummary] = useState<any>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const addMessage = useCallback(
    (role: InterviewMessageRole, content: string) => {
      const message: InterviewMessage = {
        id: makeId(role === 'assistant' ? 'ai' : 'user'),
        role,
        content,
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, message]);
      return message.id;
    },
    []
  );

  const addAssistantMessage = useCallback(
    (content: string) => addMessage('assistant', content),
    [addMessage]
  );

  const addUserMessage = useCallback(
    (content: string) => addMessage('user', content),
    [addMessage]
  );

  const ensureIdentifiers = useCallback(() => {
    let activeSessionId = sessionId;
    let activeUserId = userId;

    if (!activeSessionId) {
      activeSessionId = localStorage.getItem('ajc_interview_session') || `mock_session_${Date.now()}`;
      setSessionId(activeSessionId);
      localStorage.setItem('ajc_interview_session', activeSessionId);
    }

    if (!activeUserId) {
      activeUserId = localStorage.getItem('ajc_interview_user') || `mock_user_${Date.now()}`;
      setUserId(activeUserId);
      localStorage.setItem('ajc_interview_user', activeUserId);
    }

    return { activeSessionId, activeUserId };
  }, [sessionId, userId]);

  const setModeHandler = useCallback((nextMode: InterviewMode) => {
    setModeState(nextMode);
  }, []);

  const setFlowStepHandler = useCallback((step: InterviewFlowStep) => {
    setFlowStepState(step);
  }, []);

  const setTargetRoleHandler = useCallback((role: string | null) => {
    setTargetRoleState(role);
  }, []);

  const setTotalQuestionsHandler = useCallback((count: number | null) => {
    setTotalQuestionsState(count);
  }, []);

  const updateRound = useCallback((round: RoundType) => {
    setRoundType(round);
  }, []);

  const resetInterviewConversation = useCallback(() => {
    setConversation([]);
    setFlowStepState('idle');
    setModeState(null);
    setTotalQuestionsState(null);
  }, []);

  const beginInterviewIntro = useCallback((context: {
    intentRole?: string | null;
    projectNames?: string[];
  }) => {
    setModeState(null);
    setTotalQuestionsState(null);
    if (context.intentRole) {
      setTargetRoleState(context.intentRole);
    }

    setConversation((prev) => {
      if (prev.length > 0) {
        return prev;
      }

      const highlights: string[] = [];
      if (context.intentRole) {
        highlights.push(`目标岗位是${context.intentRole}`);
      }
      if (context.projectNames && context.projectNames.length > 0) {
        highlights.push(`重要项目包括${context.projectNames.slice(0, 2).join('、')}`);
      }

      const summary =
        highlights.length > 0
          ? `我已经整理了你的求职资料：${highlights.join('，')}。`
          : '我这里暂时还没有看到你的目标岗位或项目背景信息。';
      const infoHint = context.intentRole ? '' : ' 也请先告诉我你的目标岗位和代表项目，方便我匹配题目。';

      setFlowStepState('awaitingMode');

      return [
        {
          id: makeId('ai'),
          role: 'assistant',
          content: `${summary}${infoHint} 在开始前先确认一下：你想要进行【模拟面试】还是【面试复盘】呢？`,
          timestamp: Date.now(),
        },
      ];
    });
  }, []);

  const buildRecentMessages = useCallback(() =>
    questions.flatMap((q) => {
      const records = [{ role: 'assistant' as const, content: q.q }];
      if (q.userAnswer) {
        records.push({ role: 'user' as const, content: q.userAnswer });
      }
      if (q.evaluation?.tips) {
        records.push({ role: 'assistant' as const, content: q.evaluation.tips });
      }
      return records;
    }),
  [questions]);

  const handleRoundComplete = useCallback((payload: any) => {
    const reportId = payload?.reportId || `report_${Date.now()}`;
    const summary = payload?.summary || null;
    const snapshot = questions.map((q) => ({
      id: q.id,
      question: q.q,
      userAnswer: q.userAnswer,
      evaluation: q.evaluation,
    }));

    setLatestSummary({
      reportId,
      summary,
      roundType,
      questions: snapshot,
      timestamp: Date.now(),
    });

    setHistory((prev) => [
      ...prev,
      {
        roundType: roundType || '未指定',
        timestamp: Date.now(),
        reportId,
      },
    ]);

    setTotalQuestionsState(null);
    setRoundCompleted(true);
    setFlowStepState('idle');
    setQuestions([]);
    setCurrentQuestionIndex(0);
    addAssistantMessage('本轮模拟结束，我已生成总结报告。随时准备好时我们可以开始新一轮。');
  }, [questions, roundType, addAssistantMessage]);

  const completeRound = useCallback(async () => {
    if (!roundType) {
      addAssistantMessage('还没有选择面试轮次，请先告诉我想练习的轮次。');
      return;
    }

    const { activeSessionId, activeUserId } = ensureIdentifiers();

    setIsLoadingQuestion(true);
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finish_round',
          sessionId: activeSessionId,
          userId: activeUserId,
          roundType,
          recentMessages: buildRecentMessages(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.type === 'error') {
        throw new Error(data.payload.message || '生成总结失败');
      }

      if (data.type === 'round-complete') {
        handleRoundComplete(data.payload);
      } else {
        addAssistantMessage('本轮已经完成，总结即将生成。');
        if (data.payload) {
          handleRoundComplete(data.payload);
        }
      }
    } catch (error) {
      console.error('completeRound: 生成总结失败', error);
      addAssistantMessage('生成面试总结时出现问题，请稍后再试。');
    } finally {
      setIsLoadingQuestion(false);
    }
  }, [roundType, ensureIdentifiers, buildRecentMessages, handleRoundComplete, addAssistantMessage]);

  const initInterview = useCallback((sessionId: string, userId: string, suggestedRound?: RoundType) => {
    setSessionId(sessionId);
    setUserId(userId);
    setRoundType(suggestedRound || null);
    setRoundIndex(0);
    setCurrentQuestionIndex(0);
    setQuestions([]);
    setRoundCompleted(false);
  }, []);

  const loadRound = useCallback(async (roundType: RoundType) => {
    const { activeSessionId, activeUserId } = ensureIdentifiers();

    if (!activeSessionId || !activeUserId) {
      console.error('loadRound: sessionId 或 userId 未设置');
      addAssistantMessage('还没有初始化面试会话，我将为你创建一个新的会话。请稍后再试。');
      return;
    }

    if (!roundType) {
      console.error('loadRound: roundType 不能为空');
      return;
    }

    setIsLoadingQuestion(true);
    setRoundCompleted(false);
    setLatestSummary(null);
    setRoundType(roundType);
    setQuestions([]);
    setCurrentQuestionIndex(0);

    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_round',
          sessionId: activeSessionId,
          userId: activeUserId,
          roundType,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.type === 'error') {
        throw new Error(data.payload.message || '加载轮次失败');
      }

      if (data.type === 'next-question' && data.payload.question) {
        const questionData = data.payload.question;
        const question: InterviewQuestion = {
          id: questionData.id || `q_${Date.now()}`,
          q: questionData.q || questionData.question || '',
          tips: {
            intent: questionData.tips?.intent || '',
            keyPoints: questionData.tips?.keyPoints || [],
            framework: questionData.tips?.framework || '',
            industryNotes: questionData.tips?.industryNotes,
            pitfalls: questionData.tips?.pitfalls,
            proTips: questionData.tips?.proTips,
          },
          status: 'pending' as QuestionStatus,
        };

        setQuestions([question]);
        setCurrentQuestionIndex(0);
        setFlowStepState('ready');
        setRoundCompleted(false);
        addAssistantMessage(`第1题：${question.q}`);
      }
    } catch (error) {
      console.error('loadRound: 加载轮次失败', error);
      addAssistantMessage('加载题目时出了点问题，请稍后再试或重新选择轮次。');
    } finally {
      setIsLoadingQuestion(false);
    }
  }, [ensureIdentifiers, addAssistantMessage]);

  const answerQuestion = useCallback(async (questionId: string, text: string) => {
    const { activeSessionId, activeUserId } = ensureIdentifiers();

    if (!activeSessionId || !activeUserId) {
      console.error('answerQuestion: sessionId 或 userId 未设置');
      addAssistantMessage('暂时无法记录回答，请稍后重试。');
      return;
    }

    const question = questions[currentQuestionIndex];
    if (!question || question.id !== questionId) {
      console.warn('answerQuestion: questionId 不匹配当前题目');
    }

    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, userAnswer: text, status: 'answered' as QuestionStatus }
          : q
      )
    );

    setIsEvaluating(true);

    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          sessionId: activeSessionId,
          userId: activeUserId,
          roundType,
          questionId,
          answer: text,
          recentMessages: buildRecentMessages(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.type === 'error') {
        throw new Error(data.payload.message || '提交回答失败');
      }

      if (data.type === 'evaluation' && data.payload.evaluation) {
        const evaluation: QuestionEvaluation = data.payload.evaluation;
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  evaluation,
                  status: 'evaluated' as QuestionStatus,
                }
              : q
          )
        );
        setFlowStepState('ready');
      } else {
        addAssistantMessage('我已经记录了你的回答，准备好后可以继续下一题。');
        setFlowStepState('ready');
      }
    } catch (error) {
      console.error('answerQuestion: 提交回答失败', error);
      addAssistantMessage('评估回答时出现问题，请稍后再试或重新回答。');
    } finally {
      setIsEvaluating(false);
    }
  }, [ensureIdentifiers, roundType, buildRecentMessages, addAssistantMessage, questions, currentQuestionIndex]);

  const setEvaluation = useCallback((questionId: string, evaluationData: QuestionEvaluation) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, evaluation: evaluationData, status: 'evaluated' as QuestionStatus }
          : q
      )
    );
  }, []);

  const nextQuestion = useCallback(async () => {
    if (!roundType) {
      addAssistantMessage('请先选择面试轮次，我们才能继续。');
      return;
    }

    const { activeSessionId, activeUserId } = ensureIdentifiers();

    const nextIndex = currentQuestionIndex + 1;
    if (totalQuestions !== null && nextIndex >= totalQuestions) {
      await completeRound();
      return;
    }

    setIsLoadingQuestion(true);
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next_question',
          sessionId: activeSessionId,
          userId: activeUserId,
          roundType,
          recentMessages: buildRecentMessages(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.type === 'error') {
        throw new Error(data.payload.message || '获取下一题失败');
      }

      if (data.type === 'round-complete') {
        handleRoundComplete(data.payload);
        return;
      }

      if (data.type === 'next-question' && data.payload.question) {
        const questionData = data.payload.question;
        const question: InterviewQuestion = {
          id: questionData.id || `q_${Date.now()}`,
          q: questionData.q || questionData.question || '',
          tips: {
            intent: questionData.tips?.intent || '',
            keyPoints: questionData.tips?.keyPoints || [],
            framework: questionData.tips?.framework || '',
            industryNotes: questionData.tips?.industryNotes,
            pitfalls: questionData.tips?.pitfalls,
            proTips: questionData.tips?.proTips,
          },
          status: 'pending' as QuestionStatus,
        };

        setQuestions((prev) => {
          const updated = [...prev];
          if (updated.length > nextIndex) {
            updated[nextIndex] = question;
          } else {
            updated.push(question);
          }
          return updated;
        });
        setCurrentQuestionIndex(nextIndex);
        setRoundCompleted(false);
        setFlowStepState('ready');
        addAssistantMessage(`第${nextIndex + 1}题：${question.q}`);
      }
    } catch (error) {
      console.error('nextQuestion: 获取下一题失败', error);
      addAssistantMessage('获取下一题时出现问题，请稍后再试。');
    } finally {
      setIsLoadingQuestion(false);
    }
  }, [roundType, ensureIdentifiers, buildRecentMessages, currentQuestionIndex, totalQuestions, addAssistantMessage, completeRound, handleRoundComplete]);

  const prevQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const retryCurrentQuestion = useCallback(() => {
    setQuestions((prev) =>
      prev.map((q, index) =>
        index === currentQuestionIndex
          ? { ...q, userAnswer: undefined, evaluation: undefined, status: 'pending' as QuestionStatus }
          : q
      )
    );
    setFlowStepState('ready');
    addAssistantMessage('好的，我们再来一次，请重新回答当前这题。');
  }, [currentQuestionIndex, addAssistantMessage]);

  const resetRound = useCallback(() => {
    setRoundType(null);
    setRoundIndex(0);
    setCurrentQuestionIndex(0);
    setQuestions([]);
    setRoundCompleted(false);
  }, []);

  const getCurrentQuestion = useCallback((): InterviewQuestion | null => {
    if (questions.length === 0 || currentQuestionIndex < 0 || currentQuestionIndex >= questions.length) {
      return null;
    }
    return questions[currentQuestionIndex];
  }, [questions, currentQuestionIndex]);

  const value: InterviewStore = {
    sessionId,
    userId,
    roundType,
    roundIndex,
    currentQuestionIndex,
    questions,
    roundCompleted,
    history,
    conversation,
    flowStep,
    mode,
    targetRole,
    totalQuestions,
    latestSummary,
    isLoadingQuestion,
    isEvaluating,
    initInterview,
    loadRound,
    answerQuestion,
    nextQuestion,
    prevQuestion,
    retryCurrentQuestion,
    completeRound,
    resetRound,
    getCurrentQuestion,
    beginInterviewIntro,
    addAssistantMessage,
    addUserMessage,
    setMode: setModeHandler,
    setFlowStep: setFlowStepHandler,
    setTargetRole: setTargetRoleHandler,
    setTotalQuestions: setTotalQuestionsHandler,
    setRound: updateRound,
    resetInterviewConversation,
  };

  return <InterviewContext.Provider value={value}>{children}</InterviewContext.Provider>;
}

// Hook - 兼容原有 API
export function useInterviewStore(): InterviewStore {
  const context = useContext(InterviewContext);
  if (!context) {
    // 如果没有 Provider，返回一个默认实现（仅用于开发）
    console.warn('useInterviewStore: 未找到 InterviewProvider，返回默认实现');
    return {
      sessionId: null,
      userId: null,
      roundType: null,
      roundIndex: 0,
      currentQuestionIndex: 0,
      questions: [],
      roundCompleted: false,
      history: [],
      conversation: [],
      flowStep: 'idle',
      mode: null,
      targetRole: null,
      totalQuestions: null,
      latestSummary: null,
      isLoadingQuestion: false,
      isEvaluating: false,
      initInterview: () => {},
      loadRound: async () => {},
      answerQuestion: async () => {},
      nextQuestion: async () => {},
      prevQuestion: () => {},
      retryCurrentQuestion: () => {},
      completeRound: async () => {},
      resetRound: () => {},
      getCurrentQuestion: () => null,
      beginInterviewIntro: () => {},
      addAssistantMessage: () => '',
      addUserMessage: () => '',
      setMode: () => {},
      setFlowStep: () => {},
      setTargetRole: () => {},
      setTotalQuestions: () => {},
      setRound: () => {},
      resetInterviewConversation: () => {},
    };
  }
  return context;
}
