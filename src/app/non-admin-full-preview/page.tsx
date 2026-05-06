import type { Metadata } from "next";
import Link from "next/link";
import { ForcedTokenUsagePreview } from "@/components/ForcedTokenUsagePreview";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { buildNonAdminDashboardPreviewData } from "@/lib/admin-preview-demo";
import { buildLoggedInPreviewArticles } from "@/lib/logged-in-preview-articles";
import { startOfWeekIso, todayIso } from "@/lib/plan";

export const metadata: Metadata = {
  title: "非管理员 · 我的 + 查看token消耗 合并预览",
  robots: { index: false, follow: false },
};

const DEMO_EMAIL = "non-admin-preview@login-state.local";

export default function NonAdminFullPreviewPage() {
  const articles = buildLoggedInPreviewArticles();
  const tokenPreview = buildNonAdminDashboardPreviewData();

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <h1>非管理员 · 整页预览</h1>
          <span className="sub">「我的复盘」+ 账号菜单内「查看token消耗」弹层（示意数据，非 /admin）</span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted-link" style={{ margin: 0, lineHeight: 1.55 }}>
          <strong>快捷跳转</strong>：
          <a href="#section-my-weekly" style={{ marginLeft: 8 }}>
            我的复盘
          </a>
          <span className="muted-link" style={{ margin: "0 6px" }}>
            ·
          </span>
          <a href="#section-token-sheet">查看token消耗弹层</a>
        </p>
        <p className="muted-link" style={{ margin: "10px 0 0", fontSize: "var(--fs-small)" }}>
          专用预览：
          <Link href="/preview-me-avatar-non-admin" style={{ marginLeft: 6 }}>
            /preview-me-avatar-non-admin
          </Link>
        </p>
      </div>

      <section id="section-my-weekly" style={{ scrollMarginTop: 12 }}>
        <header className="app-header" style={{ marginTop: 0 }}>
          <div className="app-header-titles">
            <div className="weekly-title-inline">
              <WeeklyAccountEntry
                email={DEMO_EMAIL}
                isAdmin={false}
                menuTrigger="avatar"
                defaultMenuOpen
              />
              <h1>我的复盘</h1>
            </div>
            <span className="sub">头像菜单默认展开 · 非管理员无「管理后台」入口</span>
          </div>
        </header>
        <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />
      </section>

      <section id="section-token-sheet" style={{ marginTop: 28, scrollMarginTop: 12 }}>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px", fontWeight: 600 }}>
          「查看token消耗」弹层（无邮箱列 · 示意）
        </h2>
        <p className="muted-link" style={{ marginBottom: 12 }}>
          真实环境在菜单中点击打开；此处为常开静态预览。
        </p>
        <ForcedTokenUsagePreview previewData={tokenPreview} viewerIsAdmin={false} />
      </section>
    </>
  );
}
