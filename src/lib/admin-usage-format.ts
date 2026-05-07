import type { AdminUsageRow } from "@/lib/admin-overview";

/** Token 展示为 K，保留 1 位小数 */
export function formatTok(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return `${(n / 1000).toFixed(1)}K`;
}

/**
 * 金额：<100 两位小数；[100,1000) 一位小数；≥1000 四舍五入到整数（美元）
 */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 100) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(1)}`;
  return `$${Math.round(n)}`;
}

export function usageRowKey(row: AdminUsageRow): string {
  return `${row.userId}:${row.usageDay || "all"}`;
}
