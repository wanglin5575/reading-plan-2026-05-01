"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSupabaseAuthMessage } from "@/lib/auth";
import { dispatchAuthChanged } from "@/lib/auth-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { PasswordInputWithToggle } from "@/components/PasswordInputWithToggle";

export function MeAccountClient({
  authEnabled,
  variant = "page",
}: {
  authEnabled: boolean;
  variant?: "page" | "overlay";
}) {
  const router = useRouter();
  const fieldId = useId();
  const loginEmailId = `${fieldId}-login-email`;
  const loginPasswordId = `${fieldId}-login-password`;
  const regEmailId = `${fieldId}-reg-email`;
  const regPasswordId = `${fieldId}-reg-password`;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) {
      setMsg("密码至少 6 位");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: origin
          ? {
              emailRedirectTo: `${origin}/auth/callback`,
            }
          : undefined,
      });
      if (error) throw error;
      if (data.session) {
        setMsg("注册成功，已登录。");
        setPassword("");
        dispatchAuthChanged();
        router.refresh();
        router.replace("/weekly");
      } else {
        setMsg(
          "账号已创建。若 Supabase 开启了「邮箱确认」，请查收邮件并点击链接验证后再登录；关闭确认时通常可直接登录。",
        );
        setMode("login");
      }
    } catch (e: unknown) {
      setMsg(formatSupabaseAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword("");
      dispatchAuthChanged();
      router.refresh();
      router.replace("/weekly");
    } catch (e: unknown) {
      setMsg(formatSupabaseAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onResendConfirmation() {
    setMsg(null);
    const em = email.trim();
    if (!em) {
      setMsg("请先填写邮箱");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: em,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) throw error;
      setMsg("验证邮件已重新发送，请查收收件箱及垃圾箱。");
    } catch (e: unknown) {
      setMsg(formatSupabaseAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword() {
    setMsg(null);
    const em = email.trim();
    if (!em) {
      setMsg("请先填写邮箱");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: `${origin}/auth/callback?next=/weekly`,
      });
      if (error) throw error;
      setMsg("已发送重置密码邮件，请打开邮件中的链接；完成后会回到本站。");
    } catch (e: unknown) {
      setMsg(formatSupabaseAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!authEnabled) {
    return (
      <div className="card me-account-card">
        <h2>账号</h2>
        <p className="muted-link">
          尚未启用登录。请在环境变量中配置 <code className="me-code">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          与 <code className="me-code">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>（与 Supabase
          项目设置中的值一致，可匿名读写的 public anon key）。
        </p>
      </div>
    );
  }

  return (
    <div className={`card me-account-card${variant === "overlay" ? " me-account-card--overlay" : ""}`}>
      {variant === "overlay" ? (
        <h1 id="auth-gate-title" className="me-account-overlay-title">
          登录阅读计划
        </h1>
      ) : (
        <h2>账号</h2>
      )}
      <p className="muted-link me-intro">
        {variant === "overlay"
          ? "使用邮箱登录或注册，待读、已读、添加与随览数据将安全同步到你的账户。"
          : "邮箱登录或注册；入口在底部「我的」页右上角小人图标。"}
      </p>

      <div className="me-mode-switch">
        <button
          type="button"
          className={mode === "login" ? "me-mode-btn active" : "me-mode-btn"}
          onClick={() => {
            setMode("login");
            setMsg(null);
          }}
        >
          登录
        </button>
        <button
          type="button"
          className={mode === "register" ? "me-mode-btn active" : "me-mode-btn"}
          onClick={() => {
            setMode("register");
            setMsg(null);
          }}
        >
          注册
        </button>
      </div>

      {mode === "login" ? (
        <form className="row" onSubmit={onLogin}>
          <label className="muted-link" htmlFor={loginEmailId}>
            邮箱
          </label>
          <input
            id={loginEmailId}
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="muted-link" htmlFor={loginPasswordId}>
            密码
          </label>
          <PasswordInputWithToggle
            id={loginPasswordId}
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
            minLength={6}
            disabled={busy}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
          <div className="me-auth-extras">
            <button type="button" className="me-link-btn" disabled={busy} onClick={onResendConfirmation}>
              重发验证邮件
            </button>
            <span className="me-auth-sep" aria-hidden>
              ·
            </span>
            <button type="button" className="me-link-btn" disabled={busy} onClick={onResetPassword}>
              忘记密码
            </button>
          </div>
        </form>
      ) : (
        <form className="row" onSubmit={onRegister}>
          <label className="muted-link" htmlFor={regEmailId}>
            邮箱
          </label>
          <input
            id={regEmailId}
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="muted-link" htmlFor={regPasswordId}>
            密码（至少 6 位）
          </label>
          <PasswordInputWithToggle
            id={regPasswordId}
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            required
            minLength={6}
            disabled={busy}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "提交中…" : "注册"}
          </button>
        </form>
      )}

      {msg && <p className="me-msg">{msg}</p>}
    </div>
  );
}
