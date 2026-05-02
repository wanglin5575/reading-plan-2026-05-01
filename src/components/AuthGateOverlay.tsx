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
  const [signedIn, setSignedIn] = useState(initialSignedIn);

  useEffect(() => {
    if (!authEnabled) return;
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      return;
    }

    const syncFromSession = () => {
      void client.auth.getSession().then(({ data: { session } }) => {
        setSignedIn(Boolean(session?.user));
      });
    };

    syncFromSession();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
    });

    const onCustom = () => syncFromSession();
    window.addEventListener("auth-changed", onCustom);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("auth-changed", onCustom);
    };
  }, [authEnabled]);

  const showGate = authEnabled && !signedIn && !isMePath(pathname);

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
