"use client";

export default function AchievementPanel({ achievements }: { achievements: string[] }) {
  const achievementData = [
    { 
      id: "新手入门 🌱", 
      title: "新手入门", 
      description: "首次与 AI 对话", 
      icon: "🌱", 
      color: "from-green-50 to-emerald-50 border-green-200 text-green-700",
      gradient: "from-green-400 to-emerald-500"
    },
    { 
      id: "简历达人 📄", 
      title: "简历达人", 
      description: "上传并优化简历", 
      icon: "📄", 
      color: "from-blue-50 to-indigo-50 border-blue-200 text-blue-700",
      gradient: "from-blue-400 to-indigo-500"
    },
    { 
      id: "面试勇士 🧠", 
      title: "面试勇士", 
      description: "完成模拟面试", 
      icon: "🧠", 
      color: "from-purple-50 to-violet-50 border-purple-200 text-purple-700",
      gradient: "from-purple-400 to-violet-500"
    },
  ];

  return (
    <div className="bg-[var(--card-bg)] border border-gray-200 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-lg shadow-lg">
          🏆
        </div>
        <h2 className="text-xl font-semibold text-gray-800 tracking-wide">成就系统</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievementData.map((achievement) => {
          const isUnlocked = achievements.includes(achievement.id);
          return (
            <div
              key={achievement.id}
              className={`group relative p-4 rounded-2xl border-2 transition-all duration-300 hover:shadow-lg hover:scale-105 cursor-pointer ${
                isUnlocked 
                  ? `bg-gradient-to-br ${achievement.color} shadow-md` 
                  : "bg-gray-50 border-gray-200 text-gray-400"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm ${
                  isUnlocked 
                    ? `bg-gradient-to-br ${achievement.gradient} text-white` 
                    : "bg-gray-200 text-gray-400"
                }`}>
                  {achievement.icon}
                </div>
                <div>
                  <h3 className={`font-semibold text-sm ${isUnlocked ? "text-gray-800" : "text-gray-400"}`}>
                    {achievement.title}
                  </h3>
                  <p className={`text-xs ${isUnlocked ? "text-gray-600" : "text-gray-400"}`}>
                    {achievement.description}
                  </p>
                </div>
              </div>
              
              {isUnlocked && (
                <div className="absolute top-2 right-2">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                </div>
              )}
              
              {!isUnlocked && (
                <div className="absolute inset-0 rounded-2xl bg-gray-200/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-xs text-gray-500 font-medium">未解锁</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {achievements.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎯</span>
          </div>
          <p className="text-gray-500 text-sm">暂无成就，完成操作解锁吧～</p>
        </div>
      )}
    </div>
  );
}


