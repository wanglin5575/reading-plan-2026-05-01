import type { AdminOverviewPayload, AdminUsageRow } from "@/lib/admin-overview";
import { estimateUsdForPromptCompletionWithCache, getAdminPricingSnapshot } from "@/lib/token-pricing";

export type AdminDailyPreviewPoint = {
  day: string;
  newUsers: number;
  totalTokens: number;
  costUsd: number;
};

export type AdminVipPreviewRow = {
  id: string;
  username: string;
  enabled: boolean;
  createdAt: string;
  mustChangePassword: boolean;
};

export type AdminDetailPreviewSlice = {
  day: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
};

/** 供 /admin-preview 注入 AdminDashboardClient，无需登录与数据库 */
export type AdminDashboardPreviewData = {
  overview: AdminOverviewPayload;
  daily: AdminDailyPreviewPoint[];
  vip: AdminVipPreviewRow[];
  detailSeries: AdminDetailPreviewSlice[];
};

function shiftDay(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 预览「按日趋势」：按区间天数生成示意序列 */
export function buildPreviewDailyForRange(days: number): AdminDailyPreviewPoint[] {
  const today = new Date().toISOString().slice(0, 10);
  const n = Math.min(Math.max(days, 7), 366);
  const out: AdminDailyPreviewPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    const reverseIdx = n - 1 - i;
    const newUsers = reverseIdx === 5 || reverseIdx === 18 ? 1 : 0;
    const totalTokens = 200 + ((reverseIdx * 37) % 900);
    const pt = Math.floor(totalTokens * 0.72);
    const ct = totalTokens - pt;
    const cp = 5 * pt;
    out.push({
      day,
      newUsers,
      totalTokens,
      costUsd: estimateUsdForPromptCompletionWithCache(pt, ct, cp),
    });
  }
  return out;
}

/** 预览「行明细」弹层：按所选天数生成示意按日切片 */
export function buildPreviewDetailSeriesForRange(days: number): AdminDetailPreviewSlice[] {
  const today = new Date().toISOString().slice(0, 10);
  const n = Math.min(Math.max(days, 7), 366);
  const out: AdminDetailPreviewSlice[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    const reverseIdx = n - 1 - i;
    const pt = 800 + reverseIdx * 120;
    const ct = 200 + reverseIdx * 40;
    const cp = 5 * pt;
    const totalTokens = pt + ct;
    out.push({
      day,
      promptTokens: pt,
      completionTokens: ct,
      cachedPromptTokens: cp,
      totalTokens,
      costUsd: estimateUsdForPromptCompletionWithCache(pt, ct, cp),
    });
  }
  return out;
}

function usageRow(
  userId: string,
  email: string,
  registeredAt: string,
  usageDay: string,
  pt: number,
  ct: number,
): AdminUsageRow {
  const cp = 5 * pt;
  return {
    userId,
    email,
    registeredAt,
    usageDay,
    promptTokens: pt,
    completionTokens: ct,
    cachedPromptTokens: cp,
    totalTokens: pt + ct,
    costUsd: estimateUsdForPromptCompletionWithCache(pt, ct, cp),
  };
}

export function buildAdminDashboardPreviewData(): AdminDashboardPreviewData {
  const pricing = getAdminPricingSnapshot();

  const usageRows: AdminUsageRow[] = [
    usageRow(
      "00000000-0000-4000-8000-0000000000a1",
      "alice.preview@example.com",
      new Date(Date.now() - 86400000 * 40).toISOString(),
      "",
      18_200 + 2_400,
      4_100 + 600,
    ),
    usageRow(
      "00000000-0000-4000-8000-0000000000b2",
      "bob.preview@example.com",
      new Date(Date.now() - 86400000 * 12).toISOString(),
      "",
      9_600,
      2_800,
    ),
  ];

  const tableTokenSum = usageRows.reduce((s, r) => s + r.totalTokens, 0);
  const tableCostSum = usageRows.reduce((s, r) => s + r.costUsd, 0);

  const overview: AdminOverviewPayload = {
    viewerIsAdmin: true,
    memberCount: 3,
    totalTokens: tableTokenSum + 8_000,
    totalCostUsd: estimateUsdForPromptCompletionWithCache(6_000, 2_000, 18_000) + tableCostSum,
    usageRows,
    authSource: "supabase_admin",
    pricing,
    meta: {
      supabaseAuthCount: 3,
      registryCount: 3,
      serviceRoleConfigured: true,
      databaseConfigured: true,
    },
  };

  const daily = buildPreviewDailyForRange(30);

  const vip: AdminVipPreviewRow[] = [
    {
      id: "00000000-0000-4000-8000-00000000c301",
      username: "demo_vip",
      enabled: true,
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      mustChangePassword: true,
    },
    {
      id: "00000000-0000-4000-8000-00000000c302",
      username: "archived_demo",
      enabled: false,
      createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
      mustChangePassword: false,
    },
  ];

  const detailSeries = buildPreviewDetailSeriesForRange(7);

  return { overview, daily, vip, detailSeries };
}

const NON_ADMIN_PREVIEW_EMAIL = "non-admin-preview@login-state.local";

/** 非管理员 /admin 视角：按日示意行 */
export function buildNonAdminDashboardPreviewData(): AdminDashboardPreviewData {
  const base = buildAdminDashboardPreviewData();
  const demoEmail = NON_ADMIN_PREVIEW_EMAIL;
  const reg = new Date(Date.now() - 86400000 * 40).toISOString();
  const usageRows: AdminUsageRow[] = [
    usageRow("00000000-0000-4000-8000-0000000000a1", demoEmail, reg, shiftDay(new Date().toISOString().slice(0, 10), -1), 1200, 400),
    usageRow("00000000-0000-4000-8000-0000000000a1", demoEmail, reg, shiftDay(new Date().toISOString().slice(0, 10), -3), 800, 200),
  ];
  const tableTokenSum = usageRows.reduce((s, r) => s + r.totalTokens, 0);
  const tableCostSum = usageRows.reduce((s, r) => s + r.costUsd, 0);

  const overview: AdminOverviewPayload = {
    ...base.overview,
    viewerIsAdmin: false,
    memberCount: 0,
    totalTokens: tableTokenSum,
    totalCostUsd: tableCostSum,
    usageRows,
  };

  return {
    overview,
    daily: base.daily,
    vip: base.vip,
    detailSeries: base.detailSeries,
  };
}
