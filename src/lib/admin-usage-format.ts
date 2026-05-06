import type { AdminUsageRow } from "@/lib/admin-overview";

export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return `$${n.toFixed(4)}`;
}

export function formatTok(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("zh-CN") : "0";
}

export function usageRowKey(row: AdminUsageRow): string {
  return `${row.userId}:${row.usageDay || "all"}`;
}
