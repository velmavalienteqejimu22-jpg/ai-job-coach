"use client";

import { useState, useEffect, useRef } from "react";
import StageController from "@/components/StageController";
import ChatFlow, { Message } from "@/components/ChatFlow";
import Whiteboard, { WhiteboardData } from "@/components/Whiteboard";
import StageTransitionModal from "@/components/StageTransitionModal";
import StageSelector from "@/components/StageSelector";
import InputBar from "@/components/InputBar";
import InterviewPanel from "@/components/interview/InterviewPanel";
import { useStageFSM, STAGE_ORDER, STAGE_NAMES } from "@/lib/fsm";
import { UserStage, StageNames, getNextStage, isValidStage } from "@/lib/stage";
import { useInterviewStore } from "@/store/interviewStore";

export default function ChatPage() {
  const fsm = useStageFSM("career");
  const { initInterview, sessionId: interviewSessionId, userId: interviewUserId } = useInterviewStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [whiteboardData, setWhiteboardData] = useState<WhiteboardData>({});
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [pendingNextStage, setPendingNextStage] = useState<string | null>(null);
  const analyzeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 维护 userStage 状态
  const [userStage, setUserStage] = useState<UserStage>("career_planning");
  
  // 维护 userId 和 sessionId
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // 从数据库加载会话数据（优先于 localStorage）
  useEffect(() => {
    const loadSession = async () => {
      try {
        // 从 localStorage 获取 userId 和 sessionId
        const savedUserId = localStorage.getItem("userId");
        const savedSessionId = localStorage.getItem("sessionId");

        // 调用 API 加载会话
        const response = await fetch("/api/load-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: savedUserId,
            sessionId: savedSessionId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          // 保存 userId 和 sessionId
          if (data.userId) {
            localStorage.setItem("userId", data.userId);
            setUserId(data.userId);
          }
          if (data.sessionId) {
            localStorage.setItem("sessionId", data.sessionId);
            setSessionId(data.sessionId);
          }

          if (data.userId && data.sessionId && (!interviewUserId || !interviewSessionId)) {
            initInterview(data.sessionId, data.userId);
          }

          // 恢复消息
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(data.messages);
          }

          // 恢复白板数据
          if (data.whiteboard && Object.keys(data.whiteboard).length > 0) {
            setWhiteboardData(data.whiteboard);
          }

          // 恢复当前阶段
          if (data.currentStage && isValidStage(data.currentStage)) {
            setUserStage(data.currentStage);
            
            // 同步更新 FSM
            const fsmStageMap: Record<UserStage, string> = {
              career_planning: "career",
              project_review: "project",
              resume_optimization: "resume",
              application_strategy: "apply",
              interview: "interview",
              salary_talk: "offer",
              offer: "offer",
            };
            const fsmStage = fsmStageMap[data.currentStage];
            if (fsmStage) {
              fsm.transition(fsmStage);
            }
          }
        } else {
          console.error("加载会话失败:", await response.text());
          // 如果加载失败，回退到 localStorage
          loadFromLocalStorage();
        }
      } catch (error) {
        console.error("加载会话失败:", error);
        // 如果加载失败，回退到 localStorage
        loadFromLocalStorage();
      } finally {
        setIsLoadingSession(false);
      }
    };

    // 从 localStorage 加载的降级函数
    const loadFromLocalStorage = () => {
      try {
        // 尝试从 localStorage 读取保存的 userStage
        const savedUserStage = localStorage.getItem("ajc_userStage");
        if (savedUserStage && isValidStage(savedUserStage)) {
          setUserStage(savedUserStage);
          
          // 加载该阶段的聊天记录
          const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
          if (chatHistoryStr) {
            const chatHistory = JSON.parse(chatHistoryStr);
            const stageMessages = chatHistory[savedUserStage];
            
            if (stageMessages && Array.isArray(stageMessages)) {
              const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
                id: msg.id,
                content: msg.content,
                isUser: msg.isUser,
                timestamp: new Date(msg.timestamp),
              }));
              setMessages(restoredMessages);
            }
          }
        }

        // 加载白板数据
        const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
        if (whiteboardDataStr) {
          const whiteboardData = JSON.parse(whiteboardDataStr);
          if (whiteboardData && Object.keys(whiteboardData).length > 0) {
            setWhiteboardData(whiteboardData);
          }
        }
      } catch (error) {
        console.error("从 localStorage 加载失败:", error);
      }
    };

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 检查是否有从简历编辑器返回的标记（只在组件挂载时检查一次）
  useEffect(() => {
    // 如果从简历编辑器返回，确保停留在简历优化阶段
    // 这个检查只在组件首次挂载时执行，避免覆盖用户手动选择的阶段
    const savedStage = localStorage.getItem("ajc_userStage");
    const fromResumeEditor = sessionStorage.getItem("fromResumeEditor");
    
    // 只有在明确从简历编辑器返回时才设置
    if (fromResumeEditor === "true" && savedStage === "resume_optimization") {
      setUserStage("resume_optimization");
      // 同步更新 FSM
      const fsmStageMap: Record<UserStage, string> = {
        career_planning: "career",
        project_review: "project",
        resume_optimization: "resume",
        application_strategy: "apply",
        interview: "interview",
        salary_talk: "offer",
        offer: "offer",
      };
      const fsmStage = fsmStageMap["resume_optimization"];
      if (fsmStage) {
        fsm.transition(fsmStage);
      }
      // 清除标记，避免下次进入时再次触发
      sessionStorage.removeItem("fromResumeEditor");
    }
  }, []); // 只在组件挂载时执行一次

  // 从 localStorage 读取用户数据并初始化 userStage（降级方案，只在数据库加载失败时使用）
  // 注意：这个 useEffect 只在组件挂载时执行一次，且只在数据库加载完成后才执行
  useEffect(() => {
    // 只在数据库加载完成后且没有从数据库加载到阶段时才执行
    if (isLoadingSession) {
      return; // 等待数据库加载完成
    }

    // 如果 userStage 已经不是初始值，说明已经从数据库加载了，不需要从 localStorage 加载
    // 使用一个 ref 来标记是否已经执行过，避免重复执行
    const hasLoadedFromDB = userStage !== "career_planning" || messages.length > 0;
    if (hasLoadedFromDB) {
      return;
    }

    try {
      const userData = localStorage.getItem("ajc_user");
      if (userData) {
        const data = JSON.parse(userData);
        if (data.currentStage) {
          // 将中文阶段名映射到 UserStage
          const stageMap: Record<string, UserStage> = {
            "职业规划": "career_planning",
            "项目梳理": "project_review",
            "简历优化": "resume_optimization",
            "投递策略": "application_strategy",
            "面试辅导": "interview",
            "谈薪策略": "salary_talk",
            "Offer": "offer",
          };
          const mappedStage = stageMap[data.currentStage];
          if (mappedStage && isValidStage(mappedStage)) {
            setUserStage(mappedStage);
            // 同步更新 FSM
            const fsmStageMap: Record<string, string> = {
              "职业规划": "career",
              "项目梳理": "project",
              "简历优化": "resume",
              "投递策略": "apply",
              "面试辅导": "interview",
              "谈薪策略": "offer",
              "Offer": "offer",
            };
            const stageKey = fsmStageMap[data.currentStage] || "career";
            if (fsm.getCurrent() !== stageKey) {
              fsm.transition(stageKey);
            }
            return; // 如果从 ajc_user 加载成功，就不需要从 ajc_userStage 加载了
          }
        }
      }
      
      // 尝试从 localStorage 读取保存的 userStage（降级方案）
      const savedUserStage = localStorage.getItem("ajc_userStage");
      if (savedUserStage && isValidStage(savedUserStage)) {
        setUserStage(savedUserStage);
        // 同步更新 FSM
        const fsmStageMap: Record<UserStage, string> = {
          career_planning: "career",
          project_review: "project",
          resume_optimization: "resume",
          application_strategy: "apply",
          interview: "interview",
          salary_talk: "offer",
          offer: "offer",
        };
        const fsmStage = fsmStageMap[savedUserStage as UserStage];
        if (fsmStage) {
          fsm.transition(fsmStage);
        }
        // 加载该阶段的聊天记录
        const loadStageChatHistory = (stage: UserStage) => {
          try {
            const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
            if (chatHistoryStr) {
              const chatHistory = JSON.parse(chatHistoryStr);
              const stageMessages = chatHistory[stage];
              
              if (stageMessages && Array.isArray(stageMessages)) {
                const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
                  id: msg.id,
                  content: msg.content,
                  isUser: msg.isUser,
                  timestamp: new Date(msg.timestamp),
                }));
                setMessages(restoredMessages);
              }
            }
          } catch (error) {
            console.error("加载聊天记录失败:", error);
          }
        };
        loadStageChatHistory(savedUserStage as UserStage);
      } else {
        // 如果没有保存的阶段，加载默认阶段的聊天记录
        const loadStageChatHistory = (stage: UserStage) => {
          try {
            const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
            if (chatHistoryStr) {
              const chatHistory = JSON.parse(chatHistoryStr);
              const stageMessages = chatHistory[stage];
              
              if (stageMessages && Array.isArray(stageMessages)) {
                const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
                  id: msg.id,
                  content: msg.content,
                  isUser: msg.isUser,
                  timestamp: new Date(msg.timestamp),
                }));
                setMessages(restoredMessages);
              }
            }
          } catch (error) {
            console.error("加载聊天记录失败:", error);
          }
        };
        loadStageChatHistory("career_planning");
      }
    } catch (error) {
      console.error("从 localStorage 加载用户数据失败:", error);
    }
  }, [isLoadingSession, userStage, messages.length, fsm]); // 只在数据库加载状态改变时执行
  
  // 保存 userStage 到 localStorage
  useEffect(() => {
    localStorage.setItem("ajc_userStage", userStage);
  }, [userStage]);

  // 保存 whiteboardData 到 localStorage
  useEffect(() => {
    if (Object.keys(whiteboardData).length > 0) {
      localStorage.setItem("ajc_whiteboardData", JSON.stringify(whiteboardData));
    }
  }, [whiteboardData]);


  // 暴露 setWhiteboardData 到全局，方便在控制台测试
  useEffect(() => {
    (window as any).setWhiteboardData = (data: WhiteboardData) => {
      setWhiteboardData(data);
      console.log("whiteboardData 已更新:", data);
    };
    return () => {
      delete (window as any).setWhiteboardData;
    };
  }, []);

  const [showStageSelector, setShowStageSelector] = useState(false);

  const handleBack = () => {
    // 点击返回按钮时，显示阶段选择页面
    setShowStageSelector(true);
  };

  // 保存当前阶段的聊天记录
  const saveStageChatHistory = (stage: UserStage, chatMessages: Message[]) => {
    try {
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      const chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : {};
      
      // 保存该阶段的聊天记录
      chatHistory[stage] = chatMessages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        isUser: msg.isUser,
        timestamp: msg.timestamp.toISOString(),
      }));
      
      localStorage.setItem("ajc_chatHistory", JSON.stringify(chatHistory));
    } catch (error) {
      console.error("保存聊天记录失败:", error);
    }
  };

  // 加载特定阶段的聊天记录
  const loadStageChatHistory = (stage: UserStage) => {
    try {
      const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
      if (chatHistoryStr) {
        const chatHistory = JSON.parse(chatHistoryStr);
        const stageMessages = chatHistory[stage];
        
        if (stageMessages && Array.isArray(stageMessages)) {
          // 恢复该阶段的聊天记录
          const restoredMessages: Message[] = stageMessages.map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            isUser: msg.isUser,
            timestamp: new Date(msg.timestamp),
          }));
          setMessages(restoredMessages);
        } else {
          // 如果没有该阶段的记录，清空消息
          setMessages([]);
        }
      } else {
        // 如果没有聊天记录，清空消息
        setMessages([]);
      }
    } catch (error) {
      console.error("加载聊天记录失败:", error);
      setMessages([]);
    }
  };

  const handleSelectStage = (stage: UserStage) => {
    // 先保存当前阶段的聊天记录
    saveStageChatHistory(userStage, messages);
    
    // 切换到选中的阶段
    setUserStage(stage);
    
    // 保存到 localStorage（确保阶段持久化）
    localStorage.setItem("ajc_userStage", stage);
    
    // 同步更新 FSM
    const fsmStageMap: Record<UserStage, string> = {
      career_planning: "career",
      project_review: "project",
      resume_optimization: "resume",
      application_strategy: "apply",
      interview: "interview",
      salary_talk: "offer",
      offer: "offer",
    };
    const fsmStage = fsmStageMap[stage];
    if (fsmStage) {
      fsm.transition(fsmStage);
    }
    
    // 加载该阶段的聊天记录
    loadStageChatHistory(stage);
    
    // 隐藏阶段选择器
    setShowStageSelector(false);
  };

  // 暴露 FSM 到全局，方便在控制台测试
  // 使用 useRef 来稳定引用，避免重复设置
  const fsmRef = useRef(fsm);
  fsmRef.current = fsm;
  
  useEffect(() => {
    (window as any).fsm = {
      transition: (stage: string) => fsmRef.current.transition(stage),
      back: () => fsmRef.current.back(),
      getCurrent: () => fsmRef.current.getCurrent(),
      getCurrentName: () => fsmRef.current.getCurrentName(),
      canGoBack: () => fsmRef.current.canGoBack(),
    };
    return () => {
      delete (window as any).fsm;
    };
  }, []); // 只在组件挂载时执行一次

  // 获取下一个阶段
  const getNextStage = (currentStage: string): string | null => {
    const currentIndex = STAGE_ORDER.indexOf(currentStage as any);
    if (currentIndex < STAGE_ORDER.length - 1) {
      return STAGE_ORDER[currentIndex + 1];
    }
    return null;
  };

  // 分析对话并更新白板数据
  const analyzeConversation = async () => {
    try {
      // 获取所有消息（用于完整上下文）
      const allMessages = messages.map((msg) => ({
        role: msg.isUser ? "user" : "assistant" as const,
        content: msg.content,
      }));

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: allMessages,
          userStage: userStage, // 传递当前阶段
          sessionId: sessionId, // 传递 sessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`分析 API 错误: ${response.status}`);
      }

      const analyzeData: WhiteboardData = await response.json();
      console.log("白板分析结果:", analyzeData);

      // 合并新数据到现有白板数据（保留已有数据，只更新新字段）
      setWhiteboardData((prev) => {
        const merged: WhiteboardData = { ...prev };

        // 合并数组字段（追加新项，避免重复）
        if (analyzeData.starProjects && analyzeData.starProjects.length > 0) {
          const existingIds = new Set((prev.starProjects || []).map((p) => p.id));
          const newProjects = analyzeData.starProjects.filter((p) => !existingIds.has(p.id));
          merged.starProjects = [...(prev.starProjects || []), ...newProjects];
        }

        if (analyzeData.resumeInsights && analyzeData.resumeInsights.length > 0) {
          const existingIds = new Set((prev.resumeInsights || []).map((i) => i.id));
          const newInsights = analyzeData.resumeInsights.filter((i) => !existingIds.has(i.id));
          merged.resumeInsights = [...(prev.resumeInsights || []), ...newInsights];
        }

        if (analyzeData.interviewReports && analyzeData.interviewReports.length > 0) {
          const existingIds = new Set((prev.interviewReports || []).map((r) => r.id));
          const newReports = analyzeData.interviewReports.filter((r) => !existingIds.has(r.id));
          merged.interviewReports = [...(prev.interviewReports || []), ...newReports];
        }

        // 直接覆盖非数组字段（如果新数据存在）
        if (analyzeData.intentRole) merged.intentRole = analyzeData.intentRole;
        if (analyzeData.keySkills && analyzeData.keySkills.length > 0) {
          // 合并技能，去重
          const existingSkills = new Set(prev.keySkills || []);
          merged.keySkills = [
            ...(prev.keySkills || []),
            ...analyzeData.keySkills.filter((s) => !existingSkills.has(s)),
          ];
        }
        if (analyzeData.targetCompanies && analyzeData.targetCompanies.length > 0) {
          merged.targetCompanies = analyzeData.targetCompanies;
        }
        if (analyzeData.salaryStrategy) {
          merged.salaryStrategy = analyzeData.salaryStrategy;
        }
        if (analyzeData.offers && analyzeData.offers.length > 0) {
          merged.offers = analyzeData.offers;
        }

        return merged;
      });
    } catch (error) {
      console.error("分析对话失败:", error);
    }
  };

  // Debounce 分析函数（使用 ref 确保访问最新状态）
  const messagesRef = useRef(messages);
  const userStageRef = useRef(userStage);
  const sessionIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    userStageRef.current = userStage;
  }, [userStage]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const debouncedAnalyze = useRef(() => {
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
    }
    analyzeTimeoutRef.current = setTimeout(async () => {
      try {
        // 使用 ref 获取最新的 messages 和 userStage
        const allMessages = messagesRef.current.map((msg) => ({
          role: msg.isUser ? "user" : "assistant" as const,
          content: msg.content,
        }));

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: allMessages,
            userStage: userStageRef.current,
            sessionId: sessionIdRef.current, // 传递 sessionId
          }),
        });

        if (!response.ok) {
          throw new Error(`分析 API 错误: ${response.status}`);
        }

        const analyzeData: WhiteboardData = await response.json();
        console.log("自动分析结果:", analyzeData);

        // 合并新数据到现有白板数据
        setWhiteboardData((prev) => {
          const merged: WhiteboardData = { ...prev };

          // 合并数组字段（追加新项，避免重复）
          if (analyzeData.starProjects && analyzeData.starProjects.length > 0) {
            const existingIds = new Set((prev.starProjects || []).map((p) => p.id));
            const newProjects = analyzeData.starProjects.filter((p) => !existingIds.has(p.id));
            merged.starProjects = [...(prev.starProjects || []), ...newProjects];
          }

          if (analyzeData.resumeInsights && analyzeData.resumeInsights.length > 0) {
            const existingIds = new Set((prev.resumeInsights || []).map((i) => i.id));
            const newInsights = analyzeData.resumeInsights.filter((i) => !existingIds.has(i.id));
            merged.resumeInsights = [...(prev.resumeInsights || []), ...newInsights];
          }

          if (analyzeData.interviewReports && analyzeData.interviewReports.length > 0) {
            const existingIds = new Set((prev.interviewReports || []).map((r) => r.id));
            const newReports = analyzeData.interviewReports.filter((r) => !existingIds.has(r.id));
            merged.interviewReports = [...(prev.interviewReports || []), ...newReports];
          }

          // 直接覆盖非数组字段（如果新数据存在）
          if (analyzeData.intentRole) merged.intentRole = analyzeData.intentRole;
          if (analyzeData.keySkills && analyzeData.keySkills.length > 0) {
            const existingSkills = new Set(prev.keySkills || []);
            merged.keySkills = [
              ...(prev.keySkills || []),
              ...analyzeData.keySkills.filter((s) => !existingSkills.has(s)),
            ];
          }
          if (analyzeData.targetCompanies && analyzeData.targetCompanies.length > 0) {
            merged.targetCompanies = analyzeData.targetCompanies;
          }
          if (analyzeData.salaryStrategy) {
            merged.salaryStrategy = analyzeData.salaryStrategy;
          }
          if (analyzeData.offers && analyzeData.offers.length > 0) {
            merged.offers = analyzeData.offers;
          }

          // 保存合并后的白板数据到数据库（异步，不阻塞 UI）
          if (sessionIdRef.current && Object.keys(merged).length > 0) {
            fetch("/api/save-whiteboard", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: sessionIdRef.current,
                whiteboard: merged,
              }),
            }).catch(err => console.error("保存白板数据失败:", err));
          }

          return merged;
        });
      } catch (error) {
        console.error("自动分析失败:", error);
      }
    }, 1000); // 1秒 debounce
  }).current;

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (analyzeTimeoutRef.current) {
        clearTimeout(analyzeTimeoutRef.current);
      }
    };
  }, []);

  // 处理阶段切换确认
  const handleConfirmTransition = () => {
    if (pendingNextStage) {
      fsm.transition(pendingNextStage);
      setShowTransitionModal(false);
      setPendingNextStage(null);
    }
  };

  // 处理阶段切换取消
  const handleCancelTransition = () => {
    setShowTransitionModal(false);
    setPendingNextStage(null);
  };

  // 暴露 analyzeConversation 到全局，方便手动触发
  const analyzeRef = useRef(analyzeConversation);
  analyzeRef.current = analyzeConversation;
  
  useEffect(() => {
    (window as any).analyzeConversation = () => analyzeRef.current();
    return () => {
      delete (window as any).analyzeConversation;
    };
  }, []); // 只在组件挂载时执行一次

  const sendMessage = async (files?: File[]) => {
    if ((!inputValue.trim() && (!files || files.length === 0)) || isLoading) {
      return;
    }

    let messageContent = inputValue.trim();

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // 构建历史对话：包含当前阶段的消息 + 其他阶段的摘要
      const currentStageHistory = messages.map((msg) => ({
        role: msg.isUser ? "user" : "assistant" as const,
        content: msg.content,
      }));

      // 获取所有阶段的聊天记录作为上下文
      let allStagesHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
      try {
        const chatHistoryStr = localStorage.getItem("ajc_chatHistory");
        if (chatHistoryStr) {
          const chatHistory = JSON.parse(chatHistoryStr);
          // 遍历所有阶段，除了当前阶段（当前阶段的消息已经在 currentStageHistory 中）
          Object.keys(chatHistory).forEach((stage) => {
            if (stage !== userStage && chatHistory[stage] && Array.isArray(chatHistory[stage])) {
              // 为其他阶段的消息添加阶段标识
              const stageMessages = chatHistory[stage].map((msg: any) => ({
                role: msg.isUser ? "user" : "assistant" as const,
                content: `[${StageNames[stage as UserStage]}] ${msg.content}`,
              }));
              allStagesHistory = [...allStagesHistory, ...stageMessages];
            }
          });
        }
      } catch (error) {
        console.error("读取所有阶段聊天记录失败:", error);
      }

      // 合并历史对话：先其他阶段，再当前阶段（最近的消息）
      const combinedHistory = [...allStagesHistory, ...currentStageHistory].slice(-20); // 最多保留 20 条

      // 如果有文件，先上传文件并解析
      let fileContent = "";
      if (files && files.length > 0) {
        try {
          const formData = new FormData();
          files.forEach((file) => {
            formData.append("files", file);
          });

          const uploadResponse = await fetch("/api/parse-files", {
            method: "POST",
            body: formData,
          });

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            fileContent = uploadData.content || "";
            // 将文件内容添加到消息中
            if (fileContent) {
              const fileInfo = files.map((f) => f.name).join("、");
              messageContent = messageContent 
                ? `${messageContent}\n\n[已上传文件：${fileInfo}]\n${fileContent}`
                : `[已上传文件：${fileInfo}]\n${fileContent}`;
            }
          }
        } catch (error) {
          console.error("文件解析失败:", error);
        }
      }

      // 调用 API 获取 AI 回复
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageContent,
          userStage: userStage, // 传递当前阶段
          history: combinedHistory, // 传递所有阶段的聊天记录
          userId: userId, // 传递 userId
          sessionId: sessionId, // 传递 sessionId
          userState: {
            identity: (() => {
              try {
                const userData = localStorage.getItem("ajc_user");
                if (userData) {
                  const data = JSON.parse(userData);
                  return data.identity;
                }
              } catch {
                return undefined;
              }
            })(),
          },
        }),
      });

      // 检查响应状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.reply || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // 验证响应结构（开发调试用）
      console.log("API 响应数据:", data);
      console.log("reply 字段:", data.reply);
      console.log("structured 字段:", data.structured);
      console.log("shouldAdvance 字段:", data.shouldAdvance);
      console.log("nextStage 字段:", data.nextStage);

      // 确保响应包含必要字段
      if (!data.reply) {
        console.warn("警告: API 响应缺少 reply 字段");
        throw new Error("API 响应格式不正确：缺少 reply 字段");
      }

      // 检查是否在简历优化阶段且返回了优化建议
      const shouldShowResumeEditor = 
        userStage === "resume_optimization" &&
        data.structured?.resumeInsights &&
        data.structured.resumeInsights.length > 0;

      // 添加 AI 回复
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.reply,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);

      // 如果在简历优化阶段且返回了优化建议，添加编辑器缩略框
      if (shouldShowResumeEditor) {
        const editorThumbnail: Message = {
          id: `editor_${Date.now()}`,
          content: "RESUME_EDITOR_THUMBNAIL", // 特殊标记
          isUser: false,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, editorThumbnail]);
      }

      // 更新白板数据（如果返回了 structured 数据）
      if (data.structured && Object.keys(data.structured).length > 0) {
        setWhiteboardData((prev) => {
          const merged: WhiteboardData = { ...prev };

          // 合并 structured 数据到白板
          if (data.structured.intentRole) {
            merged.intentRole = data.structured.intentRole;
          }
          if (data.structured.keySkills && Array.isArray(data.structured.keySkills)) {
            const existingSkills = new Set(prev.keySkills || []);
            merged.keySkills = [
              ...(prev.keySkills || []),
              ...data.structured.keySkills.filter((s: string) => !existingSkills.has(s)),
            ];
          }
          if (data.structured.starProjects && Array.isArray(data.structured.starProjects)) {
            const existingIds = new Set((prev.starProjects || []).map((p) => p.id));
            const newProjects = data.structured.starProjects.filter(
              (p: any) => !existingIds.has(p.id)
            );
            merged.starProjects = [...(prev.starProjects || []), ...newProjects];
          }
          if (data.structured.resumeInsights && Array.isArray(data.structured.resumeInsights)) {
            const existingIds = new Set((prev.resumeInsights || []).map((i) => i.id));
            const newInsights = data.structured.resumeInsights.filter(
              (i: any) => !existingIds.has(i.id)
            );
            merged.resumeInsights = [...(prev.resumeInsights || []), ...newInsights];
          }
          if (data.structured.interviewReports && Array.isArray(data.structured.interviewReports)) {
            const existingIds = new Set((prev.interviewReports || []).map((r) => r.id));
            const newReports = data.structured.interviewReports.filter(
              (r: any) => !existingIds.has(r.id)
            );
            merged.interviewReports = [...(prev.interviewReports || []), ...newReports];
          }
          if (data.structured.targetCompanies && Array.isArray(data.structured.targetCompanies)) {
            merged.targetCompanies = data.structured.targetCompanies;
          }
          if (data.structured.salaryStrategy) {
            merged.salaryStrategy = analyzeData.salaryStrategy;
          }
          if (data.structured.offers && Array.isArray(data.structured.offers)) {
            merged.offers = analyzeData.offers;
          }

          return merged;
        });
      }

      // 处理阶段推进
      if (data.shouldAdvance && data.nextStage && isValidStage(data.nextStage)) {
        const nextStage = data.nextStage;
        console.log(`阶段推进: ${StageNames[userStage]} -> ${StageNames[nextStage]}`);
        console.log(`推进原因: ${data.stageEvaluation?.reason || "未提供"}`);
        
        // 更新 userStage
        setUserStage(nextStage);
        
        // 同步更新 FSM（用于 UI 显示）
        const fsmStageMap: Record<UserStage, string> = {
          career_planning: "career",
          project_review: "project",
          resume_optimization: "resume",
          application_strategy: "apply",
          interview: "interview",
          salary_talk: "offer",
          offer: "offer",
        };
        const fsmStage = fsmStageMap[nextStage];
        if (fsmStage && fsm.getCurrent() !== fsmStage) {
          fsm.transition(fsmStage);
        }
        
        // 进入新阶段时，刷新右侧白板（清空当前阶段的数据，保留其他阶段的数据）
        // 只清空当前阶段相关的字段
        setWhiteboardData((prev) => {
          const cleaned: WhiteboardData = { ...prev };
          
          // 根据新阶段清空对应的字段
          switch (nextStage) {
            case "career_planning":
              // 清空职业规划相关字段（如果需要重新开始）
              break;
            case "project_review":
              // 保留之前的项目，不清空
              break;
            case "resume_optimization":
              // 保留之前的优化建议
              break;
            // 其他阶段类似处理
          }
          
          return cleaned;
        });
        console.log("已进入新阶段，白板准备接收新数据");
      }

      // 每次 AI 回复后，自动调用分析（带 debounce）
      debouncedAnalyze();
      
      // 保存当前阶段的聊天记录
      const updatedMessages = [...messages, userMessage, aiMessage];
      saveStageChatHistory(userStage, updatedMessages);
    } catch (error: any) {
      console.error("发送消息失败:", error);
      // 显示更详细的错误信息
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: error.message || "抱歉，发送消息时出现了错误。请稍后再试。",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 如果正在加载会话，显示加载状态
  if (isLoadingSession) {
    return (
      <div className="min-h-screen w-full bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 mb-2">正在加载会话...</div>
          <div className="text-sm text-gray-400">恢复你的对话历史</div>
        </div>
      </div>
    );
  }

  // 如果显示阶段选择器，渲染阶段选择页面
  if (showStageSelector) {
    return (
      <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden relative">
        <StageController
          currentStage={"选择阶段"}
          onBack={() => setShowStageSelector(false)}
          canGoBack={true}
        />

        <div className="flex-1 flex overflow-hidden" style={{ paddingTop: "64px", paddingBottom: "80px" }}>
          <div className="w-full md:w-[70%] flex-shrink-0 overflow-hidden">
            <StageSelector
              onSelectStage={handleSelectStage}
              currentStage={userStage}
              className="h-full"
              onCancel={() => setShowStageSelector(false)}
            />
          </div>
          <div className="hidden md:block w-[30%] flex-shrink-0 overflow-y-auto">
            <Whiteboard data={whiteboardData} currentStage={userStage} onUpdate={setWhiteboardData} />
          </div>
        </div>
      </div>
    );
  }

  // 如果是面试阶段，显示 InterviewPanel
  if (userStage === "interview") {
    return (
      <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden relative">
        {/* 顶部阶段控制器（固定在顶部） */}
        <StageController
          currentStage={StageNames[userStage]}
          onBack={handleBack}
          canGoBack={true}
        />

        {/* 主内容区域（面试面板） */}
        <div className="flex-1 overflow-hidden" style={{ paddingTop: '64px' }}>
          <InterviewPanel
            currentStage={userStage}
            whiteboardData={whiteboardData}
            onWhiteboardUpdate={setWhiteboardData}
          />
        </div>
      </div>
    );
  }

  // 其他阶段的正常布局
  return (
    <div className="h-screen w-full bg-neutral-50 flex flex-col overflow-hidden relative">
      {/* 顶部阶段控制器（固定在顶部） */}
      <StageController
        currentStage={StageNames[userStage]}
        onBack={handleBack}
        canGoBack={true} // 始终显示返回按钮
      />

      {/* 主内容区域（添加顶部和底部 padding 避免被固定元素遮挡） */}
      <div className="flex-1 flex overflow-hidden" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
        {/* 左侧聊天流区域（70%） */}
        <div className="w-full md:w-[70%] flex-shrink-0 overflow-y-auto">
          <ChatFlow
            messages={messages}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={sendMessage}
            isLoading={isLoading}
            hideInputBar={true} // 隐藏 ChatFlow 内部的输入框
          />
        </div>

        {/* 右侧智能白板区域（30%） */}
        <div className="hidden md:block w-[30%] flex-shrink-0 overflow-y-auto">
          <Whiteboard data={whiteboardData} currentStage={userStage} onUpdate={setWhiteboardData} />
        </div>
      </div>

      {/* 底部输入框（固定在底部，类似 ChatGPT） */}
      <div 
        className="fixed bottom-0 left-0 right-0 w-full border-t border-gray-200 bg-white z-50 shadow-lg"
        style={{ 
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
        }}
      >
        <div className="w-full p-4">
          <InputBar
            value={inputValue}
            onChange={setInputValue}
            onSend={sendMessage}
            isLoading={isLoading}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* 阶段切换确认模态 */}
      <StageTransitionModal
        isOpen={showTransitionModal}
        currentStage={StageNames[userStage]}
        nextStage={pendingNextStage ? STAGE_NAMES[pendingNextStage as keyof typeof STAGE_NAMES] : ""}
        onConfirm={handleConfirmTransition}
        onCancel={handleCancelTransition}
      />
    </div>
  );
}
