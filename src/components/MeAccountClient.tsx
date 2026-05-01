"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatSupabaseAuthMessage } from "@/lib/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function MeAccountClient({
  authEnabled,
  initialEmail,
}: {
  authEnabled: boolean;
  initialEmail: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

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
        router.refresh();
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
      router.refresh();
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
        redirectTo: `${origin}/auth/callback?next=/me`,
      });
      if (error) throw error;
      setMsg("已发送重置密码邮件，请打开邮件中的链接；完成后会回到本站。");
    } catch (e: unknown) {
      setMsg(formatSupabaseAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 6) {
      setMsg("新密码至少 6 位");
      return;
    }
    if (newPassword !== newPassword2) {
      setMsg("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setNewPassword2("");
      setMsg("密码已更新。");
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

  if (initialEmail) {
    return (
      <div className="card me-account-card">
        <h2>账号</h2>
        <p className="me-logged-email">
          已登录：<span>{initialEmail}</span>
        </p>
        <p className="muted-link me-logged-hint">你的待读、已读数据已与此账号关联。</p>
        <form className="row me-change-pw" onSubmit={onChangePassword}>
          <label className="muted-link" htmlFor="me-new-pw">
            新密码（可选，用于重置后或日常修改）
          </label>
          <input
            id="me-new-pw"
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            placeholder="至少 6 位"
          />
          <label className="muted-link" htmlFor="me-new-pw2">
            确认新密码
          </label>
          <input
            id="me-new-pw2"
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            minLength={6}
          />
          <button className="btn secondary" type="submit" disabled={busy || !newPassword}>
            {busy ? "保存中…" : "保存新密码"}
          </button>
        </form>
        {msg && <p className="me-msg">{msg}</p>}
        <button type="button" className="btn secondary" disabled={busy} onClick={onLogout}>
          {busy ? "退出中…" : "退出登录"}
        </button>
      </div>
    );
  }

  return (
    <div className="card me-account-card">
      <h2>账号</h2>
      <p className="muted-link me-intro">使用邮箱注册或登录后，即可在多台设备同步阅读计划。</p>

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
          <label className="muted-link" htmlFor="me-email">
            邮箱
          </label>
          <input
            id="me-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="muted-link" htmlFor="me-password">
            密码
          </label>
          <input
            id="me-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
          <div className="me-auth-extras">
            <button
              type="button"
              className="me-link-btn"
              disabled={busy}
              onClick={onResendConfirmation}
            >
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
          <label className="muted-link" htmlFor="me-reg-email">
            邮箱
          </label>
          <input
            id="me-reg-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="muted-link" htmlFor="me-reg-password">
            密码（至少 6 位）
          </label>
          <input
            id="me-reg-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
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
