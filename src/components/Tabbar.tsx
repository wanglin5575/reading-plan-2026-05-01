"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "待读" },
  { href: "/read", label: "已读" },
  { href: "/add", label: "添加" },
  { href: "/weekly", label: "我的" },
];

export function Tabbar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar tabbar-cols-4">
      {TABS.map((tab) => {
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
