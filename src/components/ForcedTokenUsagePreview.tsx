"use client";

import { TokenUsageViewerModal } from "@/components/TokenUsageViewerModal";
import type { AdminDashboardPreviewData } from "@/lib/admin-preview-demo";

/** 设计预览：Token 消耗弹层常开 + 示意数据 */
export function ForcedTokenUsagePreview({
  previewData,
  viewerIsAdmin,
}: {
  previewData: AdminDashboardPreviewData;
  viewerIsAdmin: boolean;
}) {
  return <TokenUsageViewerModal open onClose={() => {}} viewerIsAdmin={viewerIsAdmin} previewData={previewData} />;
}
