"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatSupabaseAuthMessage } from "@/lib/auth";
import { dispatchAuthChanged } from "@/lib/auth-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { PasswordInputWithToggle } from "@/components/PasswordInputWithToggle";
import { TokenUsageViewerModal } from "@/components/TokenUsageViewerModal";
import { LS_ADMIN_REGISTRY_ACK_AT } from "@/lib/admin-registry-badge";
import { isValidNickname } from "@/lib/random-nickname";

function vipSyntheticAccountName(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^vip_([a-z0-9._-]+)@vip\.local$/);
  return m?.[1] ?? null;
}

type FanRowUi = {
  followerId: string;
  nickname: string;
  emailHint: string;
  createdAt: string;
  isFollowingBack?: boolean;
};

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
  isAdmin,
  menuTrigger = "dots",
  /** 仅设计预览页：菜单默认展开 */
  defaultMenuOpen = false,
  fanUnreadCount = 0,
}: {
  email: string;
  isAdmin?: boolean;
  /** 「我的」复盘页用小人图标；其它页用竖三点 */
  menuTrigger?: "dots" | "avatar";
  defaultMenuOpen?: boolean;
  /** 新增粉丝未读数（服务端） */
  fanUnreadCount?: number;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const [tokenUsageOpen, setTokenUsageOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [showRegistryDot, setShowRegistryDot] = useState(false);
  const [showVipPwDot, setShowVipPwDot] = useState(false);
  const [fansOpen, setFansOpen] = useState(false);
  const [fansRows, setFansRows] = useState<FanRowUi[]>([]);
  const [fansLoading, setFansLoading] = useState(false);
  const [fansErr, setFansErr] = useState<string | null>(null);
  const [fanActionBusy, setFanActionBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUid, setProfileUid] = useState("");
  const [profileEmailField, setProfileEmailField] = useState("");
  const [profileNick, setProfileNick] = useState("");
  const [profileLoad, setProfileLoad] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isVipUser = email.trim().toLowerCase().endsWith("@vip.local");
  const showFanDot = fanUnreadCount > 0;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;

    const refresh = () => {
      void (async () => {
        try {
          let ack = localStorage.getItem(LS_ADMIN_REGISTRY_ACK_AT);
          if (!ack) {
            const r = await fetch("/api/admin/registry-badge", { cache: "no-store" });
            const d = (await r.json()) as { serverNow?: string; newCount?: number };
            if (d.serverNow) localStorage.setItem(LS_ADMIN_REGISTRY_ACK_AT, d.serverNow);
            setShowRegistryDot(false);
            return;
          }
          const r = await fetch(`/api/admin/registry-badge?since=${encodeURIComponent(ack)}`, {
            cache: "no-store",
          });
          const d = (await r.json()) as { newCount?: number };
          setShowRegistryDot((d.newCount ?? 0) > 0);
        } catch {
          setShowRegistryDot(false);
        }
      })();
    };

    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onAck = () => {
      const t = localStorage.getItem(LS_ADMIN_REGISTRY_ACK_AT);
      if (t) setShowRegistryDot(false);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("admin-registry-ack", onAck);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("admin-registry-ack", onAck);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isVipUser) {
      setShowVipPwDot(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/auth/vip/password-reminder", { cache: "no-store" });
        const d = (await r.json().catch(() => ({}))) as { mustChangePassword?: boolean };
        if (!cancelled) setShowVipPwDot(Boolean(d.mustChangePassword) && r.ok);
      } catch {
        if (!cancelled) setShowVipPwDot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVipUser]);

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
    if (!pwOpen && !fansOpen && !profileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pwOpen, fansOpen, profileOpen]);

  async function openFansModal() {
    closeMenu();
    setFansOpen(true);
    setFansErr(null);
    setFansLoading(true);
    try {
      await fetch("/api/me/fans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ack_seen" }),
      });
      router.refresh();
      const r = await fetch("/api/me/fans", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as { error?: string; fans?: FanRowUi[] };
      if (!r.ok) throw new Error(d.error || "加载失败");
      setFansRows(d.fans ?? []);
    } catch (e: unknown) {
      setFansErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setFansLoading(false);
    }
  }

  async function onFollowBack(followerId: string) {
    setFanActionBusy(true);
    setFansErr(null);
    try {
      const r = await fetch("/api/me/fans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "follow_back", followerId }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "操作失败");
      const r2 = await fetch("/api/me/fans", { cache: "no-store" });
      const d2 = (await r2.json().catch(() => ({}))) as { fans?: FanRowUi[] };
      if (r2.ok) setFansRows(d2.fans ?? []);
      router.refresh();
    } catch (e: unknown) {
      setFansErr(e instanceof Error ? e.message : "操作失败");
    } finally {
      setFanActionBusy(false);
    }
  }

  async function openProfileModal() {
    closeMenu();
    setProfileOpen(true);
    setProfileMsg(null);
    setProfileLoad(true);
    try {
      const r = await fetch("/api/me/profile", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as { error?: string; userId?: string; email?: string; nickname?: string };
      if (!r.ok) throw new Error(d.error || "加载失败");
      setProfileUid(d.userId ?? "");
      setProfileEmailField(d.email ?? email);
      setProfileNick(d.nickname ?? "");
    } catch (e: unknown) {
      setProfileMsg(e instanceof Error ? e.message : "加载失败");
    } finally {
      setProfileLoad(false);
    }
  }

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    if (!isValidNickname(profileNick)) {
      setProfileMsg("昵称需 2～14 单位（中文一字算 2，英文数字算 1），且不能为空");
      return;
    }
    setProfileBusy(true);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: profileNick.trim() }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; nickname?: string };
      if (!r.ok) {
        if (d.error === "nickname_taken") throw new Error("该昵称已被注册");
        if (d.error === "invalid_nickname") throw new Error("昵称格式不符合要求");
        throw new Error(d.error || "保存失败");
      }
      if (d.nickname) setProfileNick(d.nickname);
      setProfileOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setProfileMsg(err instanceof Error ? err.message : "保存失败");
    } finally {
      setProfileBusy(false);
    }
  }

  async function onLogout() {
    closeMenu();
    setBusy(true);
    try {
      if (isVipUser) {
        await fetch("/api/auth/vip/logout", { method: "POST" });
      } else {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
      }
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
      if (isVipUser) {
        const r = await fetch("/api/auth/vip/password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ newPassword }),
        });
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) {
          if (d.error === "invalid_password") throw new Error("新密码至少 6 位");
          throw new Error(d.error || "修改失败");
        }
        setShowVipPwDot(false);
      } else {
        const supabase = createBrowserSupabaseClient();
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      }
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

  const vipName = vipSyntheticAccountName(profileEmailField);

  const fansModal =
    mounted &&
    fansOpen && (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && !fanActionBusy && setFansOpen(false)}
      >
        <div
          className="modal-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fans-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <h2 id="fans-title">我的粉丝</h2>
            <button
              type="button"
              className="modal-sheet-close"
              onClick={() => !fanActionBusy && setFansOpen(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="modal-sheet-body">
            {fansLoading ? <p className="muted-link">加载中…</p> : null}
            {fansErr ? <p className="me-msg">{fansErr}</p> : null}
            {!fansLoading && !fansErr && fansRows.length === 0 ? <p className="muted-link">暂无粉丝</p> : null}
            <ul className="fan-list-plain">
              {fansRows.map((f) => (
                <li key={f.followerId} className="fan-row">
                  <div className="fan-row-main">
                    <div className="fan-nick">{f.nickname}</div>
                    {f.emailHint ? (
                      <div className="muted-link fan-row-hint">
                        {f.emailHint}
                      </div>
                    ) : null}
                  </div>
                  {f.isFollowingBack ? (
                    <span className="muted-link fan-row-hint">已互关</span>
                  ) : (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={fanActionBusy}
                      onClick={() => void onFollowBack(f.followerId)}
                    >
                      回关
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );

  const profileModal =
    mounted &&
    profileOpen && (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && !profileBusy && setProfileOpen(false)}
      >
        <div
          className="modal-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <h2 id="profile-edit-title">修改账号信息</h2>
            <button
              type="button"
              className="modal-sheet-close"
              onClick={() => !profileBusy && setProfileOpen(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <form onSubmit={(e) => void onSaveProfile(e)}>
            <div className="modal-sheet-body row">
              {profileLoad ? <p className="muted-link">加载中…</p> : null}
              <label className="muted-link" htmlFor="prof-uid">
                UID
              </label>
              <input id="prof-uid" className="input" value={profileUid} readOnly />
              <label className="muted-link" htmlFor="prof-email-ro">
                {vipName ? "账号名称" : "邮箱"}
              </label>
              <input id="prof-email-ro" className="input" value={vipName ?? profileEmailField} readOnly />
              <label className="muted-link" htmlFor="prof-nick">
                昵称
              </label>
              <input
                id="prof-nick"
                className="input"
                value={profileNick}
                onChange={(e) => setProfileNick(e.target.value)}
                disabled={profileBusy || profileLoad}
                autoComplete="nickname"
              />
              {profileMsg ? <p className="me-msg">{profileMsg}</p> : null}
            </div>
            <div className="modal-sheet-footer">
              <button className="btn secondary" type="submit" disabled={profileBusy || profileLoad}>
                {profileBusy ? "保存中…" : "保存"}
              </button>
              <button className="btn secondary" type="button" disabled={profileBusy} onClick={() => setProfileOpen(false)}>
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
          aria-label={showRegistryDot || showVipPwDot || showFanDot ? "账号菜单（有提醒）" : "账号菜单"}
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
          {showRegistryDot || showVipPwDot || showFanDot ? (
            <span className="account-avatar-registry-dot" aria-hidden />
          ) : null}
        </button>
        {menuOpen && (
          <div className="account-menu-popover" role="menu">
            <p className="account-menu-email" role="presentation">
              {email}
            </p>
            <button type="button" className="account-menu-item account-menu-item--with-badge" role="menuitem" onClick={() => void openFansModal()}>
              <span className="account-menu-item-label">查看粉丝</span>
              {showFanDot ? <span className="account-menu-fan-dot" aria-hidden /> : null}
            </button>
            <button type="button" className="account-menu-item" role="menuitem" onClick={() => void openProfileModal()}>
              修改账号信息
            </button>
            {isAdmin ? (
              <Link href="/admin" className="account-menu-item account-menu-item--link" role="menuitem" onClick={closeMenu}>
                管理后台
              </Link>
            ) : null}
            <button
              type="button"
              className="account-menu-item"
              role="menuitem"
              onClick={() => {
                closeMenu();
                setTokenUsageOpen(true);
              }}
            >
              查看token消耗
            </button>
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
      {fansModal && createPortal(fansModal, document.body)}
      {profileModal && createPortal(profileModal, document.body)}
      <TokenUsageViewerModal
        open={tokenUsageOpen}
        onClose={() => setTokenUsageOpen(false)}
        viewerIsAdmin={Boolean(isAdmin)}
      />
    </>
  );
}
