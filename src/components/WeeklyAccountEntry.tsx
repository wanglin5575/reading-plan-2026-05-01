"use client";

import Link from "next/link";
import { AccountAvatarMenu } from "@/components/AccountAvatarMenu";

function PersonGlyph() {
  return (
    <svg className="account-avatar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
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

/** 各页右上角：已登录为账号菜单，未登录为进入 /me 登录页 */
export function WeeklyAccountEntry({
  email,
  isAdmin,
  menuTrigger = "dots",
  defaultMenuOpen,
}: {
  email: string | null;
  /** 管理员：注册红点、入口「管理后台」；非管理员无后台入口，使用「查看token消耗」 */
  isAdmin?: boolean;
  menuTrigger?: "dots" | "avatar";
  /** 仅预览页：头像菜单默认展开 */
  defaultMenuOpen?: boolean;
}) {
  if (email)
    return (
      <AccountAvatarMenu email={email} isAdmin={isAdmin} menuTrigger={menuTrigger} defaultMenuOpen={defaultMenuOpen ?? false} />
    );
  return (
    <Link href="/me" className="account-avatar-btn account-avatar-btn--link" aria-label="登录或注册" prefetch>
      <PersonGlyph />
    </Link>
  );
}
