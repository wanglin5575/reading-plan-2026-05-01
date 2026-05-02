import type { AuthUserLite } from "@/lib/supabase/admin-users";
import {
  listAllRegistryUsers,
  loadBrowseSummariesByUser,
  sumTokenUsageByUser,
  sumTokenUsageGlobal,
  type BrowseTopicsSummary,
  type RegistryUserRow,
  type TokenSumRow,
} from "@/lib/db";
import {
  estimateUsdForPromptCompletion,
  getAdminPricingSnapshot,
  type AdminPricingSnapshot,
} from "@/lib/token-pricing";

export type AdminMemberRow = {
  userId: string;
  email: string;
  registeredAt: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 按当前环境分列/折合规则从 prompt+completion 重算 */
  costUsd: number;
  /** 随览主题名称汇总 */
  browseTopicTitles: string;
  /** 随览关键词汇总（去重） */
  browseKeywords: string;
};

export type AdminOverviewPayload = {
  memberCount: number;
  totalTokens: number;
  totalCostUsd: number;
  members: AdminMemberRow[];
  authSource: "supabase_admin" | "registry_only";
  pricing: AdminPricingSnapshot;
  /** 帮助排查「列表为何为空」 */
  meta: {
    supabaseAuthCount: number;
    registryCount: number;
    /** 由 API 路由补充：是否配置了可列举 Auth 用户的服务端密钥 */
    serviceRoleConfigured?: boolean;
    /** 由 API 路由补充：是否检测到数据库连接串 */
    databaseConfigured?: boolean;
  };
};

function browseOf(map: Map<string, BrowseTopicsSummary>, userId: string): BrowseTopicsSummary {
  return map.get(userId) ?? { topicTitles: "—", keywordsLine: "—" };
}

function mergeMembers(
  authUsers: AuthUserLite[],
  registry: RegistryUserRow[],
  tokenSums: TokenSumRow[],
  browseMap: Map<string, BrowseTopicsSummary>,
): { rows: AdminMemberRow[]; source: AdminOverviewPayload["authSource"] } {
  const tokenMap = new Map(tokenSums.map((x) => [x.userId, x]));

  if (authUsers.length > 0) {
    const rows: AdminMemberRow[] = authUsers.map((u) => {
      const t = tokenMap.get(u.id);
      const promptTokens = t?.promptTokens ?? 0;
      const completionTokens = t?.completionTokens ?? 0;
      const totalTokens = t?.totalTokens ?? 0;
      const br = browseOf(browseMap, u.id);
      return {
        userId: u.id,
        email: u.email,
        registeredAt: u.createdAt,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: estimateUsdForPromptCompletion(promptTokens, completionTokens),
        browseTopicTitles: br.topicTitles,
        browseKeywords: br.keywordsLine,
      };
    });
    for (const t of tokenSums) {
      if (!rows.some((r) => r.userId === t.userId)) {
        const br = browseOf(browseMap, t.userId);
        rows.push({
          userId: t.userId,
          email: "（仅用量记录）",
          registeredAt: "",
          promptTokens: t.promptTokens,
          completionTokens: t.completionTokens,
          totalTokens: t.totalTokens,
          costUsd: estimateUsdForPromptCompletion(t.promptTokens, t.completionTokens),
          browseTopicTitles: br.topicTitles,
          browseKeywords: br.keywordsLine,
        });
      }
    }
    return { rows: rows.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt)), source: "supabase_admin" };
  }

  const rows: AdminMemberRow[] = registry.map((u) => {
    const t = tokenMap.get(u.userId);
    const promptTokens = t?.promptTokens ?? 0;
    const completionTokens = t?.completionTokens ?? 0;
    const totalTokens = t?.totalTokens ?? 0;
    const br = browseOf(browseMap, u.userId);
    return {
      userId: u.userId,
      email: u.email,
      registeredAt: u.registeredAt,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: estimateUsdForPromptCompletion(promptTokens, completionTokens),
      browseTopicTitles: br.topicTitles,
      browseKeywords: br.keywordsLine,
    };
  });
  for (const t of tokenSums) {
    if (!rows.some((r) => r.userId === t.userId)) {
      const br = browseOf(browseMap, t.userId);
      rows.push({
        userId: t.userId,
        email: "（仅用量记录）",
        registeredAt: "",
        promptTokens: t.promptTokens,
        completionTokens: t.completionTokens,
        totalTokens: t.totalTokens,
        costUsd: estimateUsdForPromptCompletion(t.promptTokens, t.completionTokens),
        browseTopicTitles: br.topicTitles,
        browseKeywords: br.keywordsLine,
      });
    }
  }
  return { rows: rows.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt)), source: "registry_only" };
}

export async function buildAdminOverview(params: {
  authUsers: AuthUserLite[];
}): Promise<AdminOverviewPayload> {
  const [registry, tokenSums, global, browseMap] = await Promise.all([
    listAllRegistryUsers(),
    sumTokenUsageByUser(),
    sumTokenUsageGlobal(),
    loadBrowseSummariesByUser(),
  ]);
  const { rows, source } = mergeMembers(params.authUsers, registry, tokenSums, browseMap);
  const memberCount = params.authUsers.length > 0 ? params.authUsers.length : registry.length;
  return {
    memberCount,
    totalTokens: global.totalTokens,
    totalCostUsd: estimateUsdForPromptCompletion(global.promptTokens, global.completionTokens),
    members: rows,
    authSource: source,
    pricing: getAdminPricingSnapshot(),
    meta: {
      supabaseAuthCount: params.authUsers.length,
      registryCount: registry.length,
    },
  };
}
