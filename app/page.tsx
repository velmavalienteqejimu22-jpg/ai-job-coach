"use client";

import { useState, useEffect } from "react";
import ChatPanel from "./panels/ChatPanel";
import ResumePanel from "./panels/ResumePanel";
import InterviewPanel from "./panels/InterviewPanel";
import AchievementPanel from "./panels/AchievementPanel";

export default function Home() {
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [toastVisible, setToastVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "resume" | "interview" | "achievements">("chat");
  // Onboarding
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onbStep, setOnbStep] = useState<1 | 2 | 3>(1);
  const [onbIdentity, setOnbIdentity] = useState<string>("");
  const [onbIntentKnown, setOnbIntentKnown] = useState<"还不确定" | "已确定" | "">("");
  const [onbIntentRole, setOnbIntentRole] = useState<string>("");
  const [onbStage, setOnbStage] = useState<string>("");
  const [pendingSubmitOnboarding, setPendingSubmitOnboarding] = useState(false);
  
  // Chat state - 提升到父组件以保持状态
  const [messages, setMessages] = useState<Array<{id: string; content: string; isUser: boolean; timestamp: Date}>>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [personalTip, setPersonalTip] = useState<string>("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  
  // 进度条状态
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const progressSteps = [
    { id: 0, name: "项目复盘", icon: "📊", completed: false },
    { id: 1, name: "简历优化", icon: "📄", completed: false },
    { id: 2, name: "面试", icon: "🎯", completed: false },
    { id: 3, name: "谈薪", icon: "💰", completed: false },
    { id: 4, name: "offer", icon: "🎉", completed: false },
  ];

  const unlockAchievement = (label: string) => {
    setUnlockedAchievements(prev => (prev.includes(label) ? prev : [...prev, label]));
    setToastMessage(`成就解锁：${label}`);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  };

  // Onboarding side-effects
  const buildOnboardingMessage = () => {
    return `【Onboarding】\n身份: ${onbIdentity || "-"}\n意向岗位: ${onbIntentKnown}${onbIntentKnown === "已确定" && onbIntentRole ? `（${onbIntentRole}）` : ""}\n当前阶段: ${onbStage || "-"}`;
  };

  const completeOnboarding = () => {
    const data = {
      identity: onbIdentity,
      intentKnown: onbIntentKnown,
      intentRole: onbIntentRole,
      stage: onbStage,
      completedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("onboarding", JSON.stringify(data));
    } catch {}
    setOnboardingOpen(false);
    // 若已有会话，立即提交记录
    if (chatSessionId) {
      const payload = buildOnboardingMessage();
      fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chatSessionId, message: payload }),
      }).catch(() => {});
    } else {
      setPendingSubmitOnboarding(true);
    }
  };

  // 根据 onboarding 数据自动定位进度
  const updateProgressFromOnboarding = (stage: string) => {
    const stageMap: { [key: string]: number } = {
      "还没写简历": 0,
      "简历已写好也比较满意": 1,
      "面试ing": 2,
      "准备谈薪": 3,
      "已offer，随便看看": 4,
    };
    setCurrentProgress(stageMap[stage] || 0);
  };

  // 打开引导（仅首次）
  useEffect(() => {
    try {
      const saved = localStorage.getItem("onboarding");
      if (!saved) {
        setOnboardingOpen(true);
      } else {
        const data = JSON.parse(saved);
        setOnbIdentity(data.identity || "");
        setOnbIntentKnown(data.intentKnown || "");
        setOnbIntentRole(data.intentRole || "");
        setOnbStage(data.stage || "");
        updateProgressFromOnboarding(data.stage || "");
      }
    } catch {
      setOnboardingOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      {toastVisible && (
        <div className="fixed top-4 right-4 z-50 bg-black text-white text-sm px-4 py-2 rounded-xl shadow-lg animate-fade-in">{toastMessage}</div>
      )}

      {/* 左侧固定侧栏 */}
      <aside className="fixed left-0 top-0 bottom-0 w-[220px] border-r border-gray-200 bg-white/90 backdrop-blur-sm p-6 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-6 px-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--accent-50)] to-[var(--accent-50)] flex items-center justify-center text-[var(--accent)] font-semibold shadow-sm">AI</div>
            <span className="font-semibold text-gray-800 tracking-wide">Job Coach</span>
          </div>
          <nav className="space-y-3">
            <button 
              onClick={() => setActiveTab("chat")} 
              className={`w-full text-left px-4 py-3 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md ${
                activeTab === "chat" 
                  ? "bg-gradient-to-r from-[var(--accent-50)] to-[var(--accent-50)] text-[var(--accent)] transform scale-[1.02]" 
                  : "bg-white hover:bg-gray-50 hover:transform hover:scale-[1.01]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-[var(--accent-50)] flex items-center justify-center">
                  <span className="text-sm">💬</span>
                </div>
                <span className="tracking-wide font-medium">求职辅导</span>
              </div>
            </button>
            <button 
              onClick={() => setActiveTab("resume")} 
              className={`w-full text-left px-4 py-3 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md ${
                activeTab === "resume" 
                  ? "bg-gradient-to-r from-blue-50 to-blue-50 text-[var(--blue-600)] transform scale-[1.02]" 
                  : "bg-white hover:bg-gray-50 hover:transform hover:scale-[1.01]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                  <span className="text-sm">📄</span>
                </div>
                <span className="tracking-wide font-medium">简历优化</span>
              </div>
            </button>
            <button 
              onClick={() => setActiveTab("interview")} 
              className={`w-full text-left px-4 py-3 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md ${
                activeTab === "interview" 
                  ? "bg-gradient-to-r from-emerald-50 to-emerald-50 text-emerald-700 transform scale-[1.02]" 
                  : "bg-white hover:bg-gray-50 hover:transform hover:scale-[1.01]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <span className="text-sm">🎯</span>
                </div>
                <span className="tracking-wide font-medium">面试指导</span>
              </div>
            </button>
            <button 
              onClick={() => setActiveTab("achievements")} 
              className={`w-full text-left px-4 py-3 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md ${
                activeTab === "achievements" 
                  ? "bg-gradient-to-r from-gray-100 to-gray-100 text-gray-800 transform scale-[1.02]" 
                  : "bg-white hover:bg-gray-50 hover:transform hover:scale-[1.01]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                  <span className="text-sm">🏆</span>
                </div>
                <span className="tracking-wide font-medium">成就系统</span>
              </div>
            </button>
          </nav>
        </div>
        <div className="flex flex-col gap-4">
          {unlockedAchievements.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 font-medium tracking-wide">已解锁成就</div>
              <div className="grid grid-cols-2 gap-2">
                {unlockedAchievements.map((achievement) => (
                  <div 
                    key={achievement} 
                    className="group relative text-xs text-gray-600 px-3 py-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:shadow-md transition-all duration-200 cursor-pointer"
                    title={achievement}
                  >
                    <div className="text-center font-medium">{achievement}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center group">
            <span className="text-lg group-hover:scale-110 transition-transform duration-200">👤</span>
          </button>
        </div>
      </aside>

      <div className="ml-[220px]">
        <header className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--accent-50)] flex items-center justify-center text-[var(--accent)] font-semibold">AI</div>
              <span className="font-semibold text-gray-800">Job Coach</span>
            </div>
          </div>
          
          {/* 进度条 */}
          <div className="max-w-5xl mx-auto px-4 pb-4">
            <div className="flex items-center justify-between relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2"></div>
              <div 
                className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-600)] -translate-y-1/2 transition-all duration-500"
                style={{ width: `${(currentProgress / (progressSteps.length - 1)) * 100}%` }}
              ></div>
              {progressSteps.map((step, index) => (
                <div key={step.id} className="relative z-10 flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                    index <= currentProgress 
                      ? "bg-[var(--accent)] text-white shadow-lg scale-110" 
                      : "bg-white border-2 border-gray-300 text-gray-400"
                  }`}>
                    {index < currentProgress ? "✓" : step.icon}
                  </div>
                  <span className={`text-xs mt-1 font-medium transition-colors duration-300 ${
                    index <= currentProgress ? "text-[var(--accent)]" : "text-gray-400"
                  }`}>
                    {step.name}
                  </span>
            </div>
          ))}
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">
          {/* 当前下一步卡片 */}
          {activeTab === "chat" && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl shadow-lg">
                      {progressSteps[currentProgress]?.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-1">
                        下一步：{progressSteps[currentProgress]?.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {currentProgress === 0 && "开始整理你的项目经历，为简历做准备"}
                        {currentProgress === 1 && "优化你的简历，突出核心技能和成果"}
                        {currentProgress === 2 && "准备面试，练习常见问题和案例分析"}
                        {currentProgress === 3 && "了解市场薪资，准备谈薪策略"}
                        {currentProgress === 4 && "恭喜！你已经拿到 offer，可以开始新工作了"}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (currentProgress === 0) setActiveTab("resume");
                      else if (currentProgress === 1) setActiveTab("resume");
                      else if (currentProgress === 2) setActiveTab("interview");
                      else if (currentProgress === 3) setActiveTab("chat");
                      else setActiveTab("achievements");
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    {currentProgress === 0 && "开始简历优化"}
                    {currentProgress === 1 && "继续优化简历"}
                    {currentProgress === 2 && "开始模拟面试"}
                    {currentProgress === 3 && "获取谈薪建议"}
                    {currentProgress === 4 && "查看成就"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "chat" && (
            <ChatPanel
              messages={messages}
              setMessages={setMessages}
              inputValue={inputValue}
              setInputValue={setInputValue}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              personalTip={personalTip}
              setPersonalTip={setPersonalTip}
              chatSessionId={chatSessionId}
              setChatSessionId={setChatSessionId}
              onAchieve={unlockAchievement}
              onSessionReady={(sid) => {
                setChatSessionId(sid);
                // 如果有待提交的 Onboarding，则现在提交
                if (pendingSubmitOnboarding) {
                  const payload = buildOnboardingMessage();
                  fetch("/api/demo-chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: sid, message: payload }),
                  }).finally(() => setPendingSubmitOnboarding(false));
                }
              }}
            />
          )}
          {activeTab === "resume" && <ResumePanel onAchieve={unlockAchievement} />}
          {activeTab === "interview" && <InterviewPanel onAchieve={unlockAchievement} />}
          {activeTab === "achievements" && <AchievementPanel achievements={unlockedAchievements} />}
        </main>
      </div>

      {/* Onboarding Modal */}
      {onboardingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 space-y-5">
            {onbStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">你的身份？</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(["实习", "应届生", "社招生"] as const).map(opt => (
                    <button key={opt} onClick={() => { setOnbIdentity(opt); setOnbStep(2); }} className={`px-3 py-2 rounded-xl border transition ${onbIdentity === opt ? "bg-[var(--accent-50)] border-[var(--accent)] text-[var(--accent)]" : "bg-white border-gray-200 hover:bg-gray-50"}`}>{opt}</button>
                  ))}
                </div>
              </div>
            )}

            {onbStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">你的意向岗位？</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setOnbIntentKnown("还不确定"); setOnbIntentRole(""); setOnbStep(3); }} className={`px-3 py-2 rounded-xl border transition ${onbIntentKnown === "还不确定" ? "bg-blue-50 border-[var(--blue-600)] text-[var(--blue-600)]" : "bg-white border-gray-200 hover:bg-gray-50"}`}>还不确定</button>
                  <button onClick={() => { setOnbIntentKnown("已确定"); }} className={`px-3 py-2 rounded-xl border transition ${onbIntentKnown === "已确定" ? "bg-blue-50 border-[var(--blue-600)] text-[var(--blue-600)]" : "bg-white border-gray-200 hover:bg-gray-50"}`}>已确定</button>
                </div>
                {onbIntentKnown === "已确定" && (
                  <div className="space-y-2">
                    <input value={onbIntentRole} onChange={e => setOnbIntentRole(e.target.value)} placeholder="填写岗位名称，如：产品经理" className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--blue-500)]" />
                    <div className="flex justify-end">
                      <button onClick={() => setOnbStep(3)} disabled={!onbIntentRole.trim()} className="px-3 py-2 rounded-xl text-white bg-[var(--blue-500)] hover:bg-[var(--blue-600)] disabled:bg-gray-300">确定</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {onbStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">你当前所处阶段？</h3>
                <div className="grid grid-cols-1 gap-2">
                  {(["还没写简历", "简历已写好也比较满意", "面试ing", "准备谈薪", "已offer，随便看看"] as const).map(opt => (
                    <button key={opt} onClick={() => setOnbStage(opt)} className={`px-3 py-2 rounded-xl border text-left transition ${onbStage === opt ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-white border-gray-200 hover:bg-gray-50"}`}>{opt}</button>
                  ))}
                </div>
                <div className="flex justify-between pt-2">
                  <button onClick={() => setOnbStep(2)} className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">上一步</button>
                  <button onClick={() => completeOnboarding()} disabled={!onbIdentity || !onbStage || (!onbIntentKnown && true) || (onbIntentKnown === "已确定" && !onbIntentRole.trim())} className="px-4 py-2 rounded-xl text-white bg-[var(--accent)] hover:bg-[var(--accent-600)] disabled:bg-gray-300">完成</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
