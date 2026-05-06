"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AdminOverviewPayload } from "@/lib/admin-overview";
import type { AdminDashboardPreviewData } from "@/lib/admin-preview-demo";
import { AdminDailyTrendChart, type AdminDailyChartPoint } from "@/components/AdminDailyTrendChart";
import { buildPreviewDailyForRange } from "@/lib/admin-preview-demo";
import { formatTok, formatUsd } from "@/lib/admin-usage-format";
import { MemberTokenUsageTable } from "@/components/MemberTokenUsageTable";

export function TokenUsageViewerModal({
  open,
  onClose,
  viewerIsAdmin,
  previewData,
}: {
  open: boolean;
  onClose: () => void;
  viewerIsAdmin: boolean;
  /** 静态预览：注入示意数据，不调接口 */
  previewData?: AdminDashboardPreviewData | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(() => previewData?.overview ?? null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [dailySeries, setDailySeries] = useState<AdminDailyChartPoint[]>(() => previewData?.daily ?? []);
  const [dailyErr, setDailyErr] = useState<string | null>(null);
  const [trendRangeDays, setTrendRangeDays] = useState(30);
  const rows = overview?.usageRows ?? [];

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    if (previewData) {
      setOverview(previewData.overview);
      setOverviewErr(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setOverviewErr(null);
      try {
        const r = await fetch("/api/admin/overview", { cache: "no-store" });
        const d = (await r.json()) as AdminOverviewPayload & { error?: string };
        if (!r.ok) throw new Error(d.error || "加载失败");
        if (!cancelled) setOverview(d);
      } catch (e) {
        if (!cancelled) setOverviewErr(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, previewData]);

  useEffect(() => {
    if (!open) return;
    if (previewData) {
      setDailySeries(buildPreviewDailyForRange(trendRangeDays));
      setDailyErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDailyErr(null);
      try {
        const r = await fetch(`/api/admin/daily?days=${trendRangeDays}`, { cache: "no-store" });
        const d = (await r.json()) as { series?: AdminDailyChartPoint[]; error?: string };
        if (!r.ok) throw new Error(d.error || "加载失败");
        if (!cancelled) setDailySeries(d.series ?? []);
      } catch (e) {
        if (!cancelled) setDailyErr(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, previewData, trendRangeDays]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const sheet = (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-sheet admin-detail-sheet"
        style={{ maxWidth: 1100, width: "min(1100px, 96vw)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-usage-sheet-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-sheet-header">
          <h2 id="token-usage-sheet-title">查看 Token 消耗</h2>
          <button type="button" className="modal-sheet-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-sheet-body">
          {loading ? <p className="muted-link">加载中…</p> : null}
          {overviewErr ? <p className="me-msg">{overviewErr}</p> : null}
          {!loading && !overviewErr && overview ? (
            <>
              <p className="admin-hint muted-link" style={{ marginTop: 0 }}>
                {viewerIsAdmin
                  ? "与「会员与用量」一致：按账号汇总；下方趋势图仅展示 Token 消耗曲线。"
                  : "按自然日汇总你的用量；下方趋势图仅展示 Token 消耗曲线。"}
              </p>
              <div className="admin-kpi-row" style={{ marginBottom: 12 }}>
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">{viewerIsAdmin ? "列表合计 Token" : "我的 AI Token 消耗"}</span>
                  <span className="admin-kpi-value">{formatTok(overview.totalTokens)}</span>
                  <span className="admin-kpi-sub">估算金额 {formatUsd(overview.totalCostUsd)}</span>
                </div>
              </div>
              <AdminDailyTrendChart
                daily={dailySeries}
                showRegSeries={false}
                rangeDays={trendRangeDays}
                onRangeDaysChange={setTrendRangeDays}
                rangeOptions={[7, 30, 90]}
                errorText={dailyErr}
              />
              {rows.length === 0 ? (
                <p className="muted-link">暂无用量数据。</p>
              ) : (
                <MemberTokenUsageTable
                  usageRows={rows}
                  layout={viewerIsAdmin ? "modal-admin-all" : "modal-self-daily"}
                  interactive={false}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return <>{createPortal(sheet, document.body)}</>;
}
