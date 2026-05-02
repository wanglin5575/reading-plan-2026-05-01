"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatSupabaseAuthMessage } from "@/lib/auth";
import { dispatchAuthChanged } from "@/lib/auth-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { PasswordInputWithToggle } from "@/components/PasswordInputWithToggle";

function ThreeDotsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

function PersonGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AccountAvatarMenu({
  email,
  showAdmin,
  menuTrigger = "dots",
}: {
  email: string;
  showAdmin?: boolean;
  /** 「我的」复盘页用小人图标；其它页用竖三点 */
  menuTrigger?: "dots" | "avatar";
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!pwOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pwOpen]);

  async function onLogout() {
    closeMenu();
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      dispatchAuthChanged();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function openPasswordModal() {
    closeMenu();
    setMsg(null);
    setNewPassword("");
    setNewPassword2("");
    setPwOpen(true);
  }

  async function onSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 6) {
      setMsg("新密码至少 6 位");
      return;
    }
    if (newPassword !== newPassword2) {
      setMsg("两次输入不一致");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPwOpen(false);
      setNewPassword("");
      setNewPassword2("");
      dispatchAuthChanged();
      router.refresh();
    } catch (err: unknown) {
      setMsg(formatSupabaseAuthMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const modal =
    mounted &&
    pwOpen && (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && !busy && setPwOpen(false)}
      >
        <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="account-pw-title" onClick={(e) => e.stopPropagation()}>
          <div className="modal-sheet-header">
            <h2 id="account-pw-title">修改密码</h2>
            <button type="button" className="modal-sheet-close" onClick={() => !busy && setPwOpen(false)} aria-label="关闭">
              ×
            </button>
          </div>
          <form onSubmit={(e) => void onSavePassword(e)}>
            <div className="modal-sheet-body row">
              <label className="muted-link" htmlFor="acct-pw1">
                新密码
              </label>
              <PasswordInputWithToggle
                id="acct-pw1"
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
                minLength={6}
                disabled={busy}
                placeholder="至少 6 位"
              />
              <label className="muted-link" htmlFor="acct-pw2">
                确认新密码
              </label>
              <PasswordInputWithToggle
                id="acct-pw2"
                autoComplete="new-password"
                value={newPassword2}
                onChange={setNewPassword2}
                minLength={6}
                disabled={busy}
              />
              {msg && <p className="me-msg">{msg}</p>}
            </div>
            <div className="modal-sheet-footer">
              <button className="btn secondary" type="submit" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => setPwOpen(false)}>
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    );

  return (
    <>
      <div className="account-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className={`account-avatar-btn${menuTrigger === "dots" ? " account-menu-kebab" : ""}`}
          aria-label="账号菜单"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          disabled={busy}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuTrigger === "avatar" ? (
            <PersonGlyph className="account-avatar-icon" />
          ) : (
            <ThreeDotsIcon className="account-avatar-icon" />
          )}
        </button>
        {menuOpen && (
          <div className="account-menu-popover" role="menu">
            <p className="account-menu-email" role="presentation">
              {email}
            </p>
            {showAdmin ? (
              <Link href="/admin" className="account-menu-item account-menu-item--link" role="menuitem" onClick={closeMenu}>
                管理后台
              </Link>
            ) : null}
            <button type="button" className="account-menu-item" role="menuitem" onClick={openPasswordModal}>
              修改密码
            </button>
            <button
              type="button"
              className="account-menu-item danger"
              role="menuitem"
              disabled={busy}
              onClick={() => void onLogout()}
            >
              退出登录
            </button>
          </div>
        )}
      </div>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
