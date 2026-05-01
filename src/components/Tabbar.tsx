"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ALL_TABS = [
  { href: "/", label: "待读" },
  { href: "/read", label: "已读" },
  { href: "/add", label: "添加" },
  { href: "/weekly", label: "复盘" },
  { href: "/me", label: "我的" },
];

export function Tabbar() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshAuth = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const d = (await r.json()) as { authEnabled?: boolean; email?: string | null };
      setLoggedIn(Boolean(d.authEnabled && d.email));
    } catch {
      setLoggedIn(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [pathname, refreshAuth]);

  useEffect(() => {
    const onAuth = () => void refreshAuth();
    window.addEventListener("auth-changed", onAuth);
    return () => window.removeEventListener("auth-changed", onAuth);
  }, [refreshAuth]);

  const tabs = loggedIn ? ALL_TABS.filter((t) => t.href !== "/me") : ALL_TABS;

  return (
    <nav className={`tabbar ${loggedIn ? "tabbar-cols-4" : "tabbar-cols-5"}`} aria-busy={!ready}>
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
