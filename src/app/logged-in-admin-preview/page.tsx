import type { Metadata } from "next";
import AdminDashboardClient from "@/components/AdminDashboardClient";
import { buildAdminDashboardPreviewData } from "@/lib/admin-preview-demo";

export const metadata: Metadata = {
  title: "管理后台 · 模拟已登录",
  robots: { index: false, follow: false },
};

/** 未真实登录：静态演示「已登录管理员」下的完整管理后台 UI（KPI / 三 Tab / 行明细弹层） */
export default function LoggedInAdminPreviewPage() {
  const previewData = buildAdminDashboardPreviewData();
  return (
    <AdminDashboardClient isAdmin previewData={previewData} previewBannerLead="模拟已登录（管理员）" />
  );
}
