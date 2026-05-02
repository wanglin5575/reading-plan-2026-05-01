"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { MeAccountClient } from "@/components/MeAccountClient";

function isMePath(path: string) {
  return path === "/me" || path.startsWith("/me/");
}

export function AuthGateOverlay({
  authEnabled,
  initialSignedIn,
}: {
  authEnabled: boolean;
  initialSignedIn: boolean;
}) {
  const pathname = usePathname() || "";
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

    void client.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSignedIn(Boolean(session?.user));
      })
      .finally(() => {
        setSessionChecked(true);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
    });

    const onCustom = () => {
      void client.auth.getSession().then(({ data: { session } }) => {
        setSignedIn(Boolean(session?.user));
      });
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
    void client.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(Boolean(session?.user));
    });
  }, [authEnabled, pathname]);

  const showGate =
    authEnabled && !isMePath(pathname) && (sessionChecked ? !signedIn : !initialSignedIn);

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
