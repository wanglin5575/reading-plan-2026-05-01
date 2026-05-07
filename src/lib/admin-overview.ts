import { fetchSupabaseAuthUsersByIds, type AuthUserLite } from "@/lib/supabase/admin-users";
import {
  listAllRegistryUsers,
  listVipAccounts,
  sumTokenUsageAggregatedByUser,
  sumTokenUsageDaysForUser,
  sumTokenUsageGlobal,
  sumTokenUsageForSingleUser,
  upsertUserRegistry,
  type RegistryUserRow,
  type VipAccountPublic,
} from "@/lib/db";
import { vipSyntheticEmail } from "@/lib/vip-auth";
import { getAdminPricingSnapshot, type AdminPricingSnapshot } from "@/lib/token-pricing";
import { accountColumnLabel, loadAccountDisplayLabelMap } from "@/lib/user-account-display";

export type AdminUsageRow = {
  userId: string;
  email: string;
  registeredAt: string;
  /** 管理端全期汇总行为空；非管理员为自然日 YYYY-MM-DD */
  usageDay: string;
  promptTokens: number;
  completionTokens: number;
  /** 产品规则：一般为输入 token 的 3 倍规模，与金额估算一致 */
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type AdminOverviewPayload = {
  viewerIsAdmin: boolean;
  memberCount: number;
  totalTokens: number;
  totalCostUsd: number;
  usageRows: AdminUsageRow[];
  authSource: "supabase_admin" | "registry_only";
  pricing: AdminPricingSnapshot;
  meta: {
    supabaseAuthCount?: number;
    registryCount?: number;
    serviceRoleConfigured?: boolean;
    databaseConfigured?: boolean;
  };
};

function buildEmailMap(authUsers: AuthUserLite[], registry: RegistryUserRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of authUsers) {
    if (u.email && u.email !== "(no-email)") m.set(u.id, u.email);
    else if (u.id && !m.has(u.id)) m.set(u.id, `（无邮箱 · ${u.id.slice(0, 8)}）`);
  }
  for (const r of registry) {
    if (!m.has(r.userId)) m.set(r.userId, r.email);
  }
  return m;
}

function fallbackAccountLabel(userId: string, viewerUserId: string, viewerEmail: string): string {
  if (userId === viewerUserId) return viewerEmail;
  return userId;
}

function regTimeMap(registry: RegistryUserRow[]): Map<string, string> {
  return new Map(registry.map((r) => [r.userId, r.registeredAt]));
}

export async function buildAdminOverview(params: {
  authUsers: AuthUserLite[];
  viewerUserId: string;
  viewerEmail: string;
  viewerIsAdmin: boolean;
  /** 为 true 时（如 Token 消耗弹窗）：仅返回当前查看者本人的用量明细与汇总 */
  usageSelfOnly?: boolean;
}): Promise<AdminOverviewPayload> {
  const usageSelfOnly = Boolean(params.usageSelfOnly);
  const loadAdminLists = params.viewerIsAdmin && !usageSelfOnly;
  const needSelfDays = !params.viewerIsAdmin || usageSelfOnly;

  const [registry, usageAgg, global, vipAccounts, selfDays] = await Promise.all([
    loadAdminLists ? listAllRegistryUsers() : Promise.resolve([] as RegistryUserRow[]),
    sumTokenUsageAggregatedByUser(),
    sumTokenUsageGlobal(),
    loadAdminLists ? listVipAccounts() : Promise.resolve([] as VipAccountPublic[]),
    needSelfDays ? sumTokenUsageDaysForUser(params.viewerUserId) : Promise.resolve([]),
  ]);

  const authSource: AdminOverviewPayload["authSource"] =
    params.authUsers.length > 0 ? "supabase_admin" : "registry_only";

  const emailMap = buildEmailMap(params.authUsers, registry);
  const regMap = regTimeMap(registry);
  for (const v of vipAccounts) {
    if (!emailMap.has(v.id)) emailMap.set(v.id, vipSyntheticEmail(v.username));
    regMap.set(v.id, v.createdAt);
  }

  const aggMap = new Map(usageAgg.map((u) => [u.userId, u]));

  if (params.viewerIsAdmin) {
    const referencedIds = new Set<string>();
    for (const u of usageAgg) referencedIds.add(u.userId);
    for (const r of registry) referencedIds.add(r.userId);
    for (const v of vipAccounts) referencedIds.add(v.id);
    for (const u of params.authUsers) referencedIds.add(u.id);

    const missingIds = [...referencedIds].filter((id) => id && !emailMap.has(id));
    if (missingIds.length > 0) {
      const extra = await fetchSupabaseAuthUsersByIds(missingIds);
      for (const u of extra) {
        if (u.email && u.email !== "(no-email)") {
          emailMap.set(u.id, u.email);
          void upsertUserRegistry({ userId: u.id, email: u.email, registeredAtIso: u.createdAt });
        } else if (!emailMap.has(u.id)) {
          emailMap.set(u.id, `（无邮箱 · ${u.id.slice(0, 8)}）`);
        }
        if (!regMap.has(u.id)) regMap.set(u.id, u.createdAt);
      }
    }
  }

  const accountDisplayMap = loadAccountDisplayLabelMap();
  function accLabel(uid: string): string {
    const base = emailMap.get(uid) ?? fallbackAccountLabel(uid, params.viewerUserId, params.viewerEmail);
    return accountColumnLabel(uid, base, accountDisplayMap);
  }

  let usageRows: AdminUsageRow[] = [];

  if (usageSelfOnly || !params.viewerIsAdmin) {
    usageRows = selfDays.map((d) => ({
      userId: params.viewerUserId,
      email: params.viewerEmail,
      registeredAt: regMap.get(params.viewerUserId) ?? "",
      usageDay: d.day,
      promptTokens: d.promptTokens,
      completionTokens: d.completionTokens,
      cachedPromptTokens: d.cachedPromptTokens,
      totalTokens: d.totalTokens,
      costUsd: d.costUsd,
    }));
  } else if (params.viewerIsAdmin) {
    const allUserIds = new Set<string>();
    for (const u of params.authUsers) allUserIds.add(u.id);
    for (const r of registry) allUserIds.add(r.userId);
    for (const u of usageAgg) allUserIds.add(u.userId);
    for (const v of vipAccounts) allUserIds.add(v.id);

    usageRows = [...allUserIds].map((uid) => {
      const agg = aggMap.get(uid);
      return {
        userId: uid,
        email: accLabel(uid),
        registeredAt: regMap.get(uid) ?? "",
        usageDay: "",
        promptTokens: agg?.promptTokens ?? 0,
        completionTokens: agg?.completionTokens ?? 0,
        cachedPromptTokens: agg?.cachedPromptTokens ?? 0,
        totalTokens: agg?.totalTokens ?? 0,
        costUsd: agg?.costUsd ?? 0,
      };
    });
    usageRows.sort((a, b) => a.email.localeCompare(b.email, "zh"));
  }

  let memberCount = 1;
  if (params.viewerIsAdmin && !usageSelfOnly) {
    memberCount = new Set(usageRows.map((r) => r.userId)).size;
  }

  let totalTokens = global.totalTokens;
  let totalCostUsd = global.totalCostUsd;
  if (!params.viewerIsAdmin || usageSelfOnly) {
    const mine = await sumTokenUsageForSingleUser(params.viewerUserId);
    totalTokens = mine?.totalTokens ?? 0;
    totalCostUsd = mine?.totalCostUsd ?? 0;
  }

  return {
    viewerIsAdmin: params.viewerIsAdmin,
    memberCount,
    totalTokens,
    totalCostUsd,
    usageRows,
    authSource,
    pricing: getAdminPricingSnapshot(),
    meta: {
      ...(params.viewerIsAdmin
        ? { supabaseAuthCount: params.authUsers.length, registryCount: registry.length }
        : {}),
    },
  };
}
