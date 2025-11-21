"use client";

import { useApp } from "./context/AppContext";
import LoginView from "./components/LoginView";
import OnboardingView from "./components/OnboardingView";
import MainLayout from "./components/MainLayout";

export default function Home() {
  const { state } = useApp();

  // 根据 view 状态渲染不同的视图
  if (state.view === "login") {
    return <LoginView />;
  }

  if (state.view === "onboarding") {
    return <OnboardingView />;
  }

  return <MainLayout />;
}
