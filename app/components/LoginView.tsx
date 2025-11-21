"use client";

import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Bot } from "./icons";

export default function LoginView() {
  const { dispatch } = useApp();
  const [nickname, setNickname] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    const user = { id: "u_" + Date.now(), name: nickname, type: "student" };
    dispatch({ type: "SET_USER", payload: user });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <Bot className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">AI Job Coach</h1>
          <p className="text-slate-500 mt-2">你的全流程智能求职助手</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">如何称呼你？</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="输入昵称或邀请码"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition transform hover:scale-[1.02]"
          >
            开始求职之旅
          </button>
        </form>
      </div>
    </div>
  );
}

