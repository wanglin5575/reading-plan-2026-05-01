import type { Metadata } from "next";
import AdminDashboardClient from "@/components/AdminDashboardClient";
import { buildAdminDashboardPreviewData } from "@/lib/admin-preview-demo";

export const metadata: Metadata = {
  title: "VIP 账号管理 · 模拟管理员预览",
  robots: { index: false, follow: false },
};

/** 固定为管理员演示数据，仅 VIP 模块；无需真实登录，可交互且不落库 */
export default function VipAccountsPreviewPage() {
  const previewData = buildAdminDashboardPreviewData();
  return (
    <AdminDashboardClient
      isAdmin
      previewData={previewData}
      previewBannerLead="模拟管理员"
      singleTabPreview="vip"
    />
  );
}
