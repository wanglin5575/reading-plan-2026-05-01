"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { MeAccountClient } from "@/components/MeAccountClient";

function isMePath(path: string) {
  return path === "/me" || path.startsWith("/me/");
}

/** 仅用于本地/设计预览：不拦登录蒙层（非真实会话） */
function isDesignPreviewPath(path: string) {
  if (path === "/login-preview" || path.startsWith("/login-preview/")) return true;
  if (path === "/logged-in-preview" || path.startsWith("/logged-in-preview/")) return true;
  if (path === "/weekly-ui-preview" || path.startsWith("/weekly-ui-preview/")) return true;
  if (path === "/weekly-non-admin-preview" || path.startsWith("/weekly-non-admin-preview/")) return true;
  if (path === "/non-admin-full-preview" || path.startsWith("/non-admin-full-preview/")) return true;
  if (path === "/preview-me-avatar-non-admin" || path.startsWith("/preview-me-avatar-non-admin/")) return true;
  if (path === "/preview-me-avatar-admin" || path.startsWith("/preview-me-avatar-admin/")) return true;
  if (path === "/site-preview" || path.startsWith("/site-preview/")) return true;
  if (path === "/admin-preview" || path.startsWith("/admin-preview/")) return true;
  if (path === "/logged-in-admin-preview" || path.startsWith("/logged-in-admin-preview/")) return true;
  if (path === "/vip-accounts-preview" || path.startsWith("/vip-accounts-preview/")) return true;
  if (path === "/browse-preview" || path.startsWith("/browse-preview/")) return true;
  if (path === "/browse-rejected-preview" || path.startsWith("/browse-rejected-preview/")) return true;
  if (path === "/demo-authed-site-preview" || path.startsWith("/demo-authed-site-preview/")) return true;
  if (path === "/add-authed-preview" || path.startsWith("/add-authed-preview/")) return true;
  return false;
}

async function resolveClientSignedIn(
  client: ReturnType<typeof createBrowserSupabaseClient>,
): Promise<boolean> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.user) return true;
  try {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    const d = (await r.json()) as { signedIn?: boolean };
    return Boolean(d.signedIn);
  } catch {
    return false;
  }
}

export function AuthGateOverlay({
  authEnabled,
  initialSignedIn,
}: {
  authEnabled: boolean;
  initialSignedIn: boolean;
}) {
  const pathnameFromHook = usePathname() || "";
  /** 少数环境下首帧 `usePathname()` 为空，会误判为需全屏登录而挡住 `/login-preview` 等预览路由 */
  const pathname =
    pathnameFromHook ||
    (typeof window !== "undefined" ? window.location.pathname : "") ||
    "";
  /** 客户端会话未拉取完前，是否与未登录仍由服务端 initialSignedIn 决定，避免两侧不一致时闪错 */
  const [sessionChecked, setSessionChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(initialSignedIn);

  useEffect(() => {
    setSignedIn(initialSignedIn);
  }, [initialSignedIn]);

  useEffect(() => {
    if (!authEnabled) {
      setSessionChecked(true);
      return;
    }
    setSessionChecked(false);
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      setSessionChecked(true);
      return;
    }

    void resolveClientSignedIn(client).then(setSignedIn).finally(() => {
      setSessionChecked(true);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void resolveClientSignedIn(client).then(setSignedIn);
    });

    const onCustom = () => {
      void resolveClientSignedIn(client).then(setSignedIn);
    };
    window.addEventListener("auth-changed", onCustom);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("auth-changed", onCustom);
    };
  }, [authEnabled]);

  /** 从 /auth/callback OAuth 重定向着陆后立刻再拉一次会话，避免首屏 RSC 与 Cookie 写入时序导致蒙层仍显示 */
  useEffect(() => {
    if (!authEnabled) return;
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      return;
    }
    void client.auth.getSession().then(() => {
      void resolveClientSignedIn(client).then(setSignedIn);
    });
  }, [authEnabled, pathname]);

  const showGate =
    authEnabled &&
    !isMePath(pathname) &&
    !isDesignPreviewPath(pathname) &&
    (sessionChecked ? !signedIn : !initialSignedIn);

  useEffect(() => {
    if (!showGate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("auth-gate-active");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("auth-gate-active");
    };
  }, [showGate]);

  if (!showGate) return null;

  return (
    <div
      className="auth-gate-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
    >
      <div className="auth-gate-center">
        <MeAccountClient authEnabled variant="overlay" />
      </div>
    </div>
  );
}
