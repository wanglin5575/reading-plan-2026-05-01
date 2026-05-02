"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSupabaseAuthMessage } from "@/lib/auth";
import { dispatchAuthChanged } from "@/lib/auth-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { PasswordInputWithToggle } from "@/components/PasswordInputWithToggle";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function MeAccountClient({
  authEnabled,
  variant = "page",
}: {
  authEnabled: boolean;
  variant?: "page" | "overlay";
}) {
  const router = useRouter();
  const registerDialogRef = useRef<HTMLDialogElement>(null);
  const fieldId = useId();
  const loginEmailId = `${fieldId}-login-email`;
  const loginPasswordId = `${fieldId}-login-password`;
  const regEmailId = `${fieldId}-reg-email`;
  const regPasswordId = `${fieldId}-reg-password`;
  const regPasswordConfirmId = `${fieldId}-reg-password-confirm`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [registerMsg, setRegisterMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openRegisterDialog() {
    setRegisterMsg(null);
    setRegPassword("");
    setRegPasswordConfirm("");
    registerDialogRef.current?.showModal();
  }

  function closeRegisterDialog() {
    registerDialogRef.current?.close();
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterMsg(null);
    if (regPassword.length < 6) {
      setRegisterMsg("密码至少 6 位");
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setRegisterMsg("两次输入的密码不一致，请检查后重试");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: regPassword,
        options: origin
          ? {
              emailRedirectTo: `${origin}/auth/callback`,
            }
          : undefined,
      });
      if (error) throw error;
      if (data.session) {
        setRegPassword("");
        setRegPasswordConfirm("");
        closeRegisterDialog();
        dispatchAuthChanged();
        router.refresh();
        router.replace("/weekly");
      } else {
        setRegPassword("");
        setRegPasswordConfirm("");
        closeRegisterDialog();
        setMsg(
          "账号已创建。若 Supabase 开启了「邮箱确认」，请查收邮件并点击链接完成验证后再登录；关闭确认时通常可直接登录。",
        );
      }
    } catch (e: unknown) {
      setRegisterMsg(formatSupabaseAuthMessage(e));
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

  async function signInWithGoogle() {
    setMsg(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=/weekly`,
        },
      });
      if (error) throw error;
      if (data.url) window.location.assign(data.url);
    } catch (e: unknown) {
      setMsg(formatSupabaseAuthMessage(e));
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
          ? "使用邮箱或 Google 登录；新用户请点击底部注册。（请在 Supabase 开启 Google 提供商）"
          : "邮箱或 Google 登录；新用户请注册。"}
      </p>

      <form className="row me-login-form" onSubmit={onLogin}>
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
          {busy ? "登录中…" : "邮箱登录"}
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

      <button
        type="button"
        className="me-google-btn"
        disabled={busy}
        onClick={() => void signInWithGoogle()}
      >
        <GoogleMark className="me-google-btn-icon" />
        Google 一键登录
      </button>

      <button type="button" className="me-register-open-btn" disabled={busy} onClick={openRegisterDialog}>
        注册
      </button>

      {msg && <p className="me-msg">{msg}</p>}

      <dialog
        ref={registerDialogRef}
        className="me-register-dialog"
        onClose={() => {
          setRegisterMsg(null);
          setRegPassword("");
          setRegPasswordConfirm("");
        }}
      >
        <div className="me-register-dialog-inner">
          <div className="me-register-head">
            <h2 className="me-register-title">注册</h2>
            <button
              type="button"
              className="me-register-close"
              aria-label="关闭"
              disabled={busy}
              onClick={closeRegisterDialog}
            >
              ×
            </button>
          </div>
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
              value={regPassword}
              onChange={setRegPassword}
              required
              minLength={6}
              disabled={busy}
            />
            <label className="muted-link" htmlFor={regPasswordConfirmId}>
              确认密码
            </label>
            <PasswordInputWithToggle
              id={regPasswordConfirmId}
              autoComplete="new-password"
              value={regPasswordConfirm}
              onChange={setRegPasswordConfirm}
              required
              minLength={6}
              disabled={busy}
            />
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "提交中…" : "注册"}
            </button>
          </form>
          {registerMsg && <p className="me-msg me-msg--in-dialog">{registerMsg}</p>}
        </div>
      </dialog>
    </div>
  );
}
