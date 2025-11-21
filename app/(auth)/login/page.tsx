"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const COUNTDOWN_SECONDS = 60;
const STORAGE_KEY = "ajc_users";

interface StoredUser {
  phone: string;
  createdAt: string;
  lastLoginAt: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState({ phone: false, code: false });
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [lastSMSResponse, setLastSMSResponse] = useState<string>("");

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [countdown]);

  const phoneError = useMemo(() => {
    if (!touched.phone || phone.trim() === "") return "";
    return PHONE_REGEX.test(phone) ? "" : "请输入有效的中国大陆手机号";
  }, [phone, touched.phone]);

  const codeError = useMemo(() => {
    if (!touched.code || code.trim() === "") return "";
    if (!sentCode) return "请先获取验证码";
    return code === sentCode ? "" : "验证码不正确";
  }, [code, touched.code, sentCode]);

  const isValid = PHONE_REGEX.test(phone) && sentCode === code && code.trim().length > 0;

  const handleSendCode = async () => {
    if (!PHONE_REGEX.test(phone)) {
      setTouched((prev) => ({ ...prev, phone: true }));
      return;
    }

    if (countdown > 0 || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const resultText = await response.clone().text();
      setLastSMSResponse(resultText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data?.code) {
        throw new Error("验证码获取失败");
      }

      setSentCode(data.code);
      setCountdown(COUNTDOWN_SECONDS);
      setTouched((prev) => ({ ...prev, code: true }));
    } catch (error) {
      console.error("发送验证码失败:", error);
      alert("验证码发送失败，请稍后重试");
    } finally {
      setIsSending(false);
    }
  };

  const handleLogin = () => {
    if (!isValid) {
      setTouched({ phone: true, code: true });
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const users: StoredUser[] = stored ? JSON.parse(stored) : [];

      const existingUserIndex = users.findIndex((item) => item.phone === phone);
      if (existingUserIndex >= 0) {
        users[existingUserIndex] = {
          ...users[existingUserIndex],
          lastLoginAt: new Date().toISOString(),
        };
      } else {
        users.push({
          phone,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        });
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
      localStorage.setItem("ajc_user", JSON.stringify({ phone }));
      router.push("/chat");
    } catch (error) {
      console.error("登录失败:", error);
      alert("登录出现问题，请稍后重试");
    }
  };

  return (
    <div className="min-h-screen w-full bg-neutral-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white shadow-lg border border-gray-200 rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">欢迎回来</h1>
          <p className="text-sm text-gray-500 mt-1">使用手机号即可完成登录或注册</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-gray-700">
              手机号
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value.trim())}
              onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
              placeholder="请输入中国大陆手机号"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
              inputMode="numeric"
              maxLength={11}
            />
            {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium text-gray-700">
              验证码
            </label>
            <div className="relative">
              <input
                id="code"
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
                onBlur={() => setTouched((prev) => ({ ...prev, code: true }))}
                placeholder="输入验证码（6 位数字）"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                maxLength={6}
                inputMode="numeric"
              />
              <button
                type="button"
                disabled={countdown > 0 || isSending}
                className="absolute inset-y-1 right-1 px-3 text-xs font-medium text-cyan-600 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleSendCode}
              >
                {countdown > 0 ? `${countdown}s 后重试` : isSending ? "发送中..." : "获取验证码"}
              </button>
            </div>
            {codeError && <p className="text-xs text-red-500">{codeError}</p>}
            {lastSMSResponse && (
              <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-md p-2">
                {lastSMSResponse}
              </pre>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogin}
          disabled={!isValid}
          className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg shadow-sm hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          登录 / 注册
        </button>

        <p className="text-xs text-gray-500 text-center">
          登录即表示同意
          <Link href="/privacy" className="text-cyan-600 hover:underline mx-1">
            隐私政策
          </Link>
          与
          <Link href="/terms" className="text-cyan-600 hover:underline mx-1">
            用户协议
          </Link>
        </p>
      </div>
    </div>
  );
}
