import type { Metadata } from "next";
import { Geist, Geist_Mono, Arimo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const arimo = Arimo({
  variable: "--font-arimo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI Job Coach - 智能求职助手",
  description: "全流程智能求职助手，帮助优化简历、准备面试、进行薪资谈判等求职相关任务",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body 
        className={`${geistSans.variable} ${geistMono.variable} ${arimo.variable} antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)] font-[family-name:var(--font-arimo)]`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
