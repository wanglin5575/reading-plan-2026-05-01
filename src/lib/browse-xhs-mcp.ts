import type { BrowseHit } from "@/lib/types";
import { detectMediaKindFromUrl } from "@/lib/media-kind";
import { normalizePublishedToIso } from "@/lib/browse-published";
import { detectLanguage, estimateReadingMinutesCalibrated } from "@/lib/classify";
import { PROFILE_SCRAPE_BOOTSTRAP, PROFILE_SCRAPE_INCREMENTAL, resolveBrowseSeedUrl } from "@/lib/browse-seed-profile";

const DEFAULT_BASE = "http://127.0.0.1:18060";
const REQUEST_MS = 120_000;

export function getXhsMcpBaseUrl(): string | null {
  const raw = process.env.XHS_MCP_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function isXhsHostUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.replace(/^www\./, "").toLowerCase();
    return /(^|\.)xhslink\.com$/.test(h) || /(^|\.)xiaohongshu\.com$/.test(h);
  } catch {
    return false;
  }
}

/** 小红书博主主页种子 */
export function isXhsProfileSeedUrl(url: string): boolean {
  return isXhsHostUrl(url) && /\/user\/profile\/[0-9a-f]+/i.test(url);
}

/** 小红书单篇笔记链接 */
export function isXhsNoteSeedUrl(url: string): boolean {
  return isXhsHostUrl(url) && /\/(?:explore|discovery\/item)\/[0-9a-zA-Z]+/i.test(url);
}

function isXhsBrowseSeedUrl(url: string): boolean {
  try {
    if (isXhsProfileSeedUrl(url) || isXhsNoteSeedUrl(url)) return true;
    const h = new URL(url.trim()).hostname.replace(/^www\./, "").toLowerCase();
    return /(^|\.)xhslink\.com$/.test(h);
  } catch {
    return false;
  }
}

export type ParsedXhsProfile = { userId: string; xsecToken: string };

export function parseXhsProfileUrl(url: string): ParsedXhsProfile | null {
  try {
    const u = new URL(url.trim());
    const m = u.pathname.match(/\/user\/profile\/([0-9a-f]+)/i);
    if (!m?.[1]) return null;
    const xsecToken = u.searchParams.get("xsec_token")?.trim() || "";
    return { userId: m[1], xsecToken };
  } catch {
    return null;
  }
}

export type ParsedXhsNote = { feedId: string; xsecToken: string };

export function parseXhsNoteUrl(url: string): ParsedXhsNote | null {
  try {
    const u = new URL(url.trim());
    const m = u.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/i);
    if (!m?.[1]) return null;
    const xsecToken = u.searchParams.get("xsec_token")?.trim() || "";
    return { feedId: m[1], xsecToken };
  } catch {
    return null;
  }
}

export function xhsExploreUrl(feedId: string, xsecToken: string): string {
  const q = xsecToken ? `?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_user` : "";
  return `https://www.xiaohongshu.com/explore/${feedId}${q}`;
}

type McpSuccess<T> = { success?: boolean; data?: T; message?: string; error?: string };

type XhsFeedItem = {
  id?: string;
  xsecToken?: string;
  noteCard?: {
    displayTitle?: string;
    type?: string;
    user?: { nickname?: string; nickName?: string };
    interactInfo?: { likedCount?: string; commentCount?: string };
  };
};

type XhsUserProfileData = {
  userBasicInfo?: { nickname?: string; desc?: string };
  feeds?: XhsFeedItem[];
};

type XhsFeedDetailData = {
  note?: {
    noteId?: string;
    xsecToken?: string;
    title?: string;
    desc?: string;
    type?: string;
    time?: number;
    user?: { nickname?: string; nickName?: string };
  };
};

async function xhsMcpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getXhsMcpBaseUrl();
  if (!base) throw new Error("missing_xhs_mcp_base_url");

  const res = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_MS),
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as McpSuccess<T> & { error?: string };
  if (!res.ok) {
    const msg = body.error || body.message || `xhs_mcp_http_${res.status}`;
    throw new Error(msg);
  }
  if (body.success === false) {
    throw new Error(body.error || body.message || "xhs_mcp_failed");
  }
  return (body.data ?? body) as T;
}

export async function getXhsMcpLoginStatus(): Promise<{ loggedIn: boolean; message?: string }> {
  const base = getXhsMcpBaseUrl();
  if (!base) return { loggedIn: false, message: "未配置 XHS_MCP_BASE_URL" };

  try {
    const data = await xhsMcpFetch<{ is_logged_in?: boolean; logged_in?: boolean; message?: string }>(
      "/api/v1/login/status",
      { method: "GET" },
    );
    const loggedIn = data.is_logged_in === true || data.logged_in === true;
    return { loggedIn, message: data.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "xhs_mcp_unreachable";
    return { loggedIn: false, message: msg };
  }
}

async function fetchXhsUserProfile(userId: string, xsecToken: string): Promise<XhsUserProfileData> {
  return xhsMcpFetch<XhsUserProfileData>("/api/v1/user/profile", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, xsec_token: xsecToken }),
  });
}

async function fetchXhsFeedDetail(feedId: string, xsecToken: string): Promise<XhsFeedDetailData> {
  return xhsMcpFetch<XhsFeedDetailData>("/api/v1/feeds/detail", {
    method: "POST",
    body: JSON.stringify({
      feed_id: feedId,
      xsec_token: xsecToken,
      load_all_comments: false,
    }),
  });
}

function feedItemToBrowseHit(
  item: XhsFeedItem,
  profileNickname?: string,
  detail?: XhsFeedDetailData,
): BrowseHit | null {
  const feedId = item.id?.trim();
  if (!feedId) return null;
  const token = (item.xsecToken || detail?.note?.xsecToken || "").trim();
  const url = xhsExploreUrl(feedId, token);
  const card = item.noteCard;
  const note = detail?.note;
  const title = (note?.title || card?.displayTitle || "无标题").trim();
  const desc = (note?.desc || "").trim();
  const author = (note?.user?.nickname || note?.user?.nickName || card?.user?.nickname || card?.user?.nickName || profileNickname || "").trim() || null;
  const excerpt = desc ? desc.slice(0, 480).replace(/\s+/g, " ") : title;
  const publishedTime =
    typeof note?.time === "number" && note.time > 0
      ? normalizePublishedToIso(new Date(note.time).toISOString())
      : null;
  const mediaType = detectMediaKindFromUrl(url);
  const lang = detectLanguage(`${title}\n${desc}`);
  const estimatedMinutes = estimateReadingMinutesCalibrated(title, excerpt, desc || title, lang, {
    mediaKind: mediaType,
  });
  return {
    url,
    title,
    description: desc || title,
    summary: desc || title,
    excerpt,
    mediaType,
    publishedTime,
    author,
    estimatedMinutes,
    fullMarkdownForAi: desc.replace(/\s+/g, " ").trim().slice(0, 12000),
  };
}

function detailToBrowseHit(detail: XhsFeedDetailData, fallbackUrl: string): BrowseHit | null {
  const note = detail.note;
  if (!note?.noteId) {
    return {
      url: fallbackUrl,
      title: fallbackUrl,
      description: "",
      summary: "",
      excerpt: "",
      mediaType: detectMediaKindFromUrl(fallbackUrl),
      publishedTime: null,
      author: null,
      estimatedMinutes: 5,
    };
  }
  return feedItemToBrowseHit(
    { id: note.noteId, xsecToken: note.xsecToken, noteCard: { displayTitle: note.title, user: note.user } },
    note.user?.nickname,
    detail,
  );
}

export type FetchBrowseXhsMcpResult = {
  hits: BrowseHit[];
  warnings: string[];
};

/**
 * 通过 xiaohongshu-mcp REST API 拉取小红书博主主页或单篇笔记。
 * 需配置 XHS_MCP_BASE_URL，且 MCP 服务已登录（扫码 / Cookie）。
 */
export async function fetchBrowseXhsMcpHits(
  seeds: string[],
  options?: { bootstrap?: boolean },
): Promise<FetchBrowseXhsMcpResult> {
  const base = getXhsMcpBaseUrl();
  if (!base || !seeds.length) {
    return {
      hits: [],
      warnings: base ? [] : ["未配置 XHS_MCP_BASE_URL，无法使用小红书 MCP 抓取。"],
    };
  }

  const login = await getXhsMcpLoginStatus();
  if (!login.loggedIn) {
    return {
      hits: [],
      warnings: [
        login.message?.includes("ECONNREFUSED") || login.message?.includes("fetch failed")
          ? `小红书 MCP 服务不可用（${base}）。请先启动 docker compose -f docker/xhs-mcp-compose.yml up -d`
          : "小红书 MCP 未登录。请访问 MCP 服务扫码登录或同步 Cookie 后再刷新随览。",
      ],
    };
  }

  const limit = options?.bootstrap ? PROFILE_SCRAPE_BOOTSTRAP : PROFILE_SCRAPE_INCREMENTAL;
  const warnings: string[] = [];
  const hits: BrowseHit[] = [];
  const seenFeed = new Set<string>();

  for (const raw of seeds) {
    const resolved = await resolveBrowseSeedUrl(raw.trim());
    if (!isXhsHostUrl(resolved)) continue;

    if (isXhsNoteSeedUrl(resolved)) {
      const parsed = parseXhsNoteUrl(resolved);
      if (!parsed) continue;
      try {
        const detail = await fetchXhsFeedDetail(parsed.feedId, parsed.xsecToken);
        const hit = detailToBrowseHit(detail, resolved);
        if (hit && !seenFeed.has(hit.url)) {
          seenFeed.add(hit.url);
          hits.push(hit);
        }
      } catch (e) {
        console.warn("[browse-xhs-mcp] note detail failed:", resolved, e);
        warnings.push(`小红书笔记抓取失败：${parsed.feedId}`);
      }
      continue;
    }

    const profile = parseXhsProfileUrl(resolved);
    if (!profile) {
      warnings.push(`无法解析小红书主页链接：${raw}`);
      continue;
    }
    if (!profile.xsecToken) {
      warnings.push("小红书主页链接缺少 xsec_token，请使用 App 分享复制完整链接。");
    }

    let profileData: XhsUserProfileData;
    try {
      profileData = await fetchXhsUserProfile(profile.userId, profile.xsecToken);
    } catch (e) {
      console.warn("[browse-xhs-mcp] user profile failed:", resolved, e);
      warnings.push(`小红书博主主页抓取失败，请确认 MCP 已登录且链接有效。`);
      continue;
    }

    const nickname = profileData.userBasicInfo?.nickname?.trim();
    const feeds = profileData.feeds ?? [];
    if (!feeds.length) {
      warnings.push(nickname ? `博主「${nickname}」未返回笔记列表。` : "博主主页未返回笔记列表。");
      continue;
    }

    for (const item of feeds) {
      if (hits.length >= limit) break;
      const feedId = item.id?.trim();
      if (!feedId || seenFeed.has(feedId)) continue;
      seenFeed.add(feedId);
      const token = (item.xsecToken || profile.xsecToken).trim();
      let hit = feedItemToBrowseHit(item, nickname);
      if (!hit) continue;

      try {
        const detail = await fetchXhsFeedDetail(feedId, token);
        const enriched = feedItemToBrowseHit(item, nickname, detail);
        if (enriched) hit = enriched;
      } catch {
        /* 保留列表页标题，详情失败仍入库 */
      }
      hits.push(hit);
    }
  }

  return { hits: hits.slice(0, limit), warnings: [...new Set(warnings)] };
}
