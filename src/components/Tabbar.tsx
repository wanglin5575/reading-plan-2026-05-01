"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "待读" },
  { href: "/read", label: "已读" },
  { href: "/add", label: "添加" },
  { href: "/browse", label: "随览" },
  { href: "/weekly", label: "我的" },
];

export function Tabbar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar tabbar-cols-5">
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
