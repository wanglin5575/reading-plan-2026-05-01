import type { Metadata } from "next";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { isAdminEmail } from "@/lib/admin";
import { buildLoggedInPreviewArticles } from "@/lib/logged-in-preview-articles";
import { startOfWeekIso, todayIso } from "@/lib/plan";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";

export const metadata: Metadata = {
  title: "我的复盘 · UI 预览（无真实登录）",
  robots: { index: false, follow: false },
};

/** 与真实会话无关，仅用于 UI 预览 */
const DEMO_EMAIL = "preview-logged-in@login-state.local";

export default function WeeklyUiPreviewPage() {
  const articles = buildLoggedInPreviewArticles();

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry
              email={DEMO_EMAIL}
              isAdmin={isAdminEmail(DEMO_EMAIL)}
              menuTrigger="avatar"
            />
            <h1>我的复盘</h1>
          </div>
          <span className="sub">
            本页为<strong>纯静态 UI</strong>（无会话、假数据）。要<strong>演示已登录</strong>打开「我的复盘」请用{" "}
            <a href="/weekly-authed-preview">/weekly-authed-preview</a>（dev 写演示 Cookie → /weekly）。
          </span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="muted-link" style={{ margin: 0 }}>
          <strong>路径说明</strong>：原 <code className="admin-code-inline">/logged-in-preview</code>{" "}
          已改为本页 <code className="admin-code-inline">/weekly-ui-preview</code>（旧链接会自动跳转过来）。
        </p>
        <p className="muted-link" style={{ margin: "10px 0 0" }}>
          本页<strong>不是</strong>已登录态。要<strong>已登录演示</strong>（与 site-preview 第二条相同）请打开{" "}
          <a href="/weekly-authed-preview">/weekly-authed-preview</a>{" "}
          或{" "}
          <a href="/preview/go/authed?path=%2Fweekly">/preview/go/authed?path=/weekly</a>
          。真实数据请登录后打开 <a href="/weekly">/weekly</a>。本页演示邮箱{" "}
          <code className="admin-code-inline">{DEMO_EMAIL}</code>（静态展示用）。
        </p>
      </div>

      <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />
    </>
  );
}
