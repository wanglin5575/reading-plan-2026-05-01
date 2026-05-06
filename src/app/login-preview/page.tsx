import type { Metadata } from "next";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "登录态预览",
  robots: { index: false, follow: false },
};

const DEMO_EMAIL = "preview@login-state.local";

export default function LoginPreviewPage() {
  return (
    <>
      <header className="app-header app-header-with-actions">
        <div className="app-header-titles">
          <h1>登录态预览</h1>
          <span className="sub">视觉示意：未写入真实 Supabase 会话，其它页仍会要求登录</span>
        </div>
        <WeeklyAccountEntry email={DEMO_EMAIL} isAdmin={isAdminEmail(DEMO_EMAIL)} />
      </header>

      <div className="card" style={{ marginTop: 8 }}>
        <p className="muted-link" style={{ marginTop: 0 }}>
          右上角为与「我的复盘」一致的<strong>竖三点菜单</strong>（演示邮箱：{DEMO_EMAIL}）。按钮可点开；退出登录等若报错属预期（无真实会话）。
        </p>
        <p className="muted-link">
          需要真实登录态时：在任意页完成登录，或使用「我的」页注册/登录。
        </p>
        <p className="muted-link" style={{ marginBottom: 0 }}>
          三条预览直达（未登录 / 「我的」演示已登录 / 管理后台演示）：<a href="/site-preview">/site-preview</a>
          ；「我的」演示已登录快捷入口：<a href="/weekly-authed-preview">/weekly-authed-preview</a>
          ；整页复盘仅静态 UI：<a href="/weekly-ui-preview">/weekly-ui-preview</a>。
        </p>
      </div>
    </>
  );
}
