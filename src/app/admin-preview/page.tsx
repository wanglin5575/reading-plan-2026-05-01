import type { Metadata } from "next";
import AdminDashboardClient from "@/components/AdminDashboardClient";
import { buildAdminDashboardPreviewData } from "@/lib/admin-preview-demo";

export const metadata: Metadata = {
  title: "管理后台 · 演示预览",
  robots: { index: false, follow: false },
};

export default function AdminPreviewPage() {
  const previewData = buildAdminDashboardPreviewData();
  return <AdminDashboardClient isAdmin previewData={previewData} />;
}
