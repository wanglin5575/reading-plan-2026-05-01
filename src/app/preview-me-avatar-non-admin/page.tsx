import type { Metadata } from "next";
import Link from "next/link";
import { ForcedTokenUsagePreview } from "@/components/ForcedTokenUsagePreview";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { buildNonAdminDashboardPreviewData } from "@/lib/admin-preview-demo";
import { buildLoggedInPreviewArticles } from "@/lib/logged-in-preview-articles";
import { startOfWeekIso, todayIso } from "@/lib/plan";

export const metadata: Metadata = {
  title: "预览 · 非管理员 · 我的复盘与账号菜单",
  robots: { index: false, follow: false },
};

const DEMO_EMAIL = "non-admin-preview@login-state.local";

export default function PreviewMeAvatarNonAdminPage() {
  const articles = buildLoggedInPreviewArticles();
  const tokenPreview = buildNonAdminDashboardPreviewData();

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <h1>预览：非管理员</h1>
          <span className="sub">我的复盘页 · 小人图标菜单默认展开；下方为「查看token消耗」弹层示意</span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="muted-link" style={{ margin: 0, fontSize: "var(--fs-small)", lineHeight: 1.55 }}>
          非管理员无法访问 <code className="admin-code-inline">/admin</code>。菜单含「查看token消耗」「修改密码」「退出登录」（VIP
          账号无改密）。管理员对照页：
          <Link href="/preview-me-avatar-admin" style={{ marginLeft: 6 }}>
            /preview-me-avatar-admin
          </Link>
        </p>
      </div>

      <header className="app-header" style={{ marginTop: 0 }}>
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry email={DEMO_EMAIL} isAdmin={false} menuTrigger="avatar" defaultMenuOpen />
            <h1>我的复盘</h1>
          </div>
          <span className="sub">静态数据 · 与真实会话无关</span>
        </div>
      </header>

      <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />

      <h2 style={{ fontSize: "1.05rem", margin: "28px 0 12px", fontWeight: 600 }} id="token-sheet">
        查看token消耗（弹层常开示意）
      </h2>
      <p className="muted-link" style={{ marginBottom: 12 }}>
        列表维度与管理员「会员与用量」一致，不展示邮箱列。
      </p>
      <ForcedTokenUsagePreview previewData={tokenPreview} viewerIsAdmin={false} />
    </>
  );
}
