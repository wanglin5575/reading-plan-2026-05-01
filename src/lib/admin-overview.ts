import type { AuthUserLite } from "@/lib/supabase/admin-users";
import {
  listAllRegistryUsers,
  sumTokenUsageByUser,
  sumTokenUsageGlobal,
  type RegistryUserRow,
  type TokenSumRow,
} from "@/lib/db";

export type AdminMemberRow = {
  userId: string;
  email: string;
  registeredAt: string;
  totalTokens: number;
  costUsd: number;
};

export type AdminOverviewPayload = {
  memberCount: number;
  totalTokens: number;
  totalCostUsd: number;
  members: AdminMemberRow[];
  authSource: "supabase_admin" | "registry_only";
};

function mergeMembers(
  authUsers: AuthUserLite[],
  registry: RegistryUserRow[],
  tokenSums: TokenSumRow[],
): { rows: AdminMemberRow[]; source: AdminOverviewPayload["authSource"] } {
  const tokenMap = new Map(tokenSums.map((x) => [x.userId, x]));

  if (authUsers.length > 0) {
    const rows: AdminMemberRow[] = authUsers.map((u) => {
      const t = tokenMap.get(u.id);
      return {
        userId: u.id,
        email: u.email,
        registeredAt: u.createdAt,
        totalTokens: t?.totalTokens ?? 0,
        costUsd: t?.costUsd ?? 0,
      };
    });
    for (const t of tokenSums) {
      if (!rows.some((r) => r.userId === t.userId)) {
        rows.push({
          userId: t.userId,
          email: "（仅用量记录）",
          registeredAt: "",
          totalTokens: t.totalTokens,
          costUsd: t.costUsd,
        });
      }
    }
    return { rows: rows.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt)), source: "supabase_admin" };
  }

  const rows: AdminMemberRow[] = registry.map((u) => {
    const t = tokenMap.get(u.userId);
    return {
      userId: u.userId,
      email: u.email,
      registeredAt: u.registeredAt,
      totalTokens: t?.totalTokens ?? 0,
      costUsd: t?.costUsd ?? 0,
    };
  });
  for (const t of tokenSums) {
    if (!rows.some((r) => r.userId === t.userId)) {
      rows.push({
        userId: t.userId,
        email: "（仅用量记录）",
        registeredAt: "",
        totalTokens: t.totalTokens,
        costUsd: t.costUsd,
      });
    }
  }
  return { rows: rows.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt)), source: "registry_only" };
}

export async function buildAdminOverview(params: {
  authUsers: AuthUserLite[];
}): Promise<AdminOverviewPayload> {
  const [registry, tokenSums, global] = await Promise.all([
    listAllRegistryUsers(),
    sumTokenUsageByUser(),
    sumTokenUsageGlobal(),
  ]);
  const { rows, source } = mergeMembers(params.authUsers, registry, tokenSums);
  const memberCount = params.authUsers.length > 0 ? params.authUsers.length : registry.length;
  return {
    memberCount,
    totalTokens: global.totalTokens,
    totalCostUsd: global.costUsd,
    members: rows,
    authSource: source,
  };
}
