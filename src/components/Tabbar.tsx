"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * 底栏内容宽 W、FAB 宽 f、四字格各至少 w_min 时：
 * W = 4*w + f + 5*g（左右 padding 各 g/2，中间 4 道缝各 g）→ g = (W - f - 4*w_min) / 5
 */
const TABBAR_TEXT_COL_MIN_PX = 32;
const TABBAR_GAP_MIN_PX = 4;
const TABBAR_GAP_MAX_PX = 20;

const TABS = [
  { href: "/", label: "待读" },
  { href: "/read", label: "已读" },
  { href: "/add", label: "添加" },
  { href: "/browse", label: "随览" },
  { href: "/weekly", label: "我的" },
];

export function Tabbar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const apply = () => {
      const W = nav.getBoundingClientRect().width;
      const fabRaw = getComputedStyle(nav).getPropertyValue("--tabbar-fab").trim();
      const fab = Number.parseFloat(fabRaw) || 56;
      const rawG = (W - fab - 4 * TABBAR_TEXT_COL_MIN_PX) / 5;
      const g = Math.min(TABBAR_GAP_MAX_PX, Math.max(TABBAR_GAP_MIN_PX, rawG));
      nav.style.setProperty("--tabbar-col-gap", `${g}px`);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={navRef} className="tabbar tabbar-cols-5">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const isAdd = tab.href === "/add";
        const className = [active ? "active" : "", isAdd ? "tabbar-add" : ""].filter(Boolean).join(" ");
        return (
          <Link key={tab.href} href={tab.href} className={className}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
