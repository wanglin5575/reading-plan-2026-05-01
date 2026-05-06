import type { Metadata } from "next";
import Link from "next/link";
import { ForcedTokenUsagePreview } from "@/components/ForcedTokenUsagePreview";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { buildAdminDashboardPreviewData } from "@/lib/admin-preview-demo";
import { buildLoggedInPreviewArticles } from "@/lib/logged-in-preview-articles";
import { startOfWeekIso, todayIso } from "@/lib/plan";

export const metadata: Metadata = {
  title: "预览 · 管理员 · 我的复盘与账号菜单",
  robots: { index: false, follow: false },
};

/** 与 `src/lib/admin.ts` 默认管理员一致，仅用于预览文案 */
const DEMO_ADMIN_EMAIL = "vienna.wwl@gmail.com";

export default function PreviewMeAvatarAdminPage() {
  const articles = buildLoggedInPreviewArticles();
  const tokenPreview = buildAdminDashboardPreviewData();

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <h1>预览：管理员</h1>
          <span className="sub">菜单含「管理后台」「查看token消耗」等；下方为全员用量弹层示意（无邮箱列）</span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="muted-link" style={{ margin: 0, fontSize: "var(--fs-small)", lineHeight: 1.55 }}>
          非管理员对照页：
          <Link href="/preview-me-avatar-non-admin" style={{ marginLeft: 6 }}>
            /preview-me-avatar-non-admin
          </Link>
          。完整后台 UI：
          <Link href="/admin-preview" style={{ marginLeft: 6 }}>
            /admin-preview
          </Link>
        </p>
      </div>

      <header className="app-header" style={{ marginTop: 0 }}>
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry email={DEMO_ADMIN_EMAIL} isAdmin menuTrigger="avatar" defaultMenuOpen />
            <h1>我的复盘</h1>
          </div>
          <span className="sub">演示邮箱 · 注册红点仅在真实管理员会话下可能出现</span>
        </div>
      </header>

      <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />

      <h2 style={{ fontSize: "1.05rem", margin: "28px 0 12px", fontWeight: 600 }} id="token-sheet">
        查看token消耗（管理员 · 分组汇总 · 弹层常开示意）
      </h2>
      <p className="muted-link" style={{ marginBottom: 12 }}>
        与「会员与用量」相同分组逻辑，不展示邮箱列。
      </p>
      <ForcedTokenUsagePreview previewData={tokenPreview} viewerIsAdmin />
    </>
  );
}
