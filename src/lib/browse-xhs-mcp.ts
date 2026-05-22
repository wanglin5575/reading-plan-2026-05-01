import type { BrowseHit } from "@/lib/types";
import { detectMediaKindFromUrl } from "@/lib/media-kind";
import { normalizePublishedToIso } from "@/lib/browse-published";
import { detectLanguage, estimateReadingMinutesCalibrated } from "@/lib/classify";
import { PROFILE_SCRAPE_BOOTSTRAP, PROFILE_SCRAPE_INCREMENTAL, resolveBrowseSeedUrl } from "@/lib/browse-seed-profile";

const DEFAULT_BASE = "http://127.0.0.1:18060";
const REQUEST_MS = 120_000;
const PROFILE_REQUEST_MS = 180_000;
const LOGIN_PROBE_MS = 45_000;
const PROFILE_FETCH_ATTEMPTS = 3;
const PROFILE_RETRY_DELAY_MS = 2_500;

const XHS_MCP_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

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

type McpSuccess<T> = { success?: boolean; data?: T; message?: string; error?: string; code?: string; details?: string };

export class XhsMcpError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly httpStatus?: number;

  constructor(message: string, opts?: { code?: string; details?: string; httpStatus?: number }) {
    super(message);
    this.name = "XhsMcpError";
    this.code = opts?.code;
    this.details = opts?.details;
    this.httpStatus = opts?.httpStatus;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatXhsProfileWarning(rawSeed: string, err: unknown): string {
  const seed = rawSeed.trim();
  if (err instanceof XhsMcpError) {
    const detail = err.details?.trim();
    const code = err.code?.trim();
    if (code === "GET_USER_PROFILE_FAILED" && /dom not stable|page stable/i.test(detail ?? "")) {
      return (
        "小红书博主主页加载超时（MCP 在等页面 DOM 稳定时失败，与登录无关）。" +
        "请在本机执行 bash scripts/build-xhs-mcp-patched-mac.sh 后重启 MCP；" +
        "或从小红书 App 重新复制最新分享链接再试。"
      );
    }
    if (code === "GET_USER_PROFILE_FAILED" && /userPageData|__INITIAL_STATE__|not found in/i.test(detail ?? "")) {
      return (
        "小红书博主主页数据未加载（多为 MCP 未登录或 Cookie 失效）。" +
        "请打开线上 /xhs-login 重新扫码登录，并确认 MCP 窗口仍运行后再刷新。"
      );
    }
    if (/xsec_token|token/i.test(detail ?? "") || /token/i.test(err.message)) {
      return "小红书主页 xsec_token 可能已过期，请从小红书 App 重新分享复制链接后再刷新。";
    }
    if (detail) {
      return `小红书博主主页抓取失败（${code ?? "MCP"}：${detail}）。链接：${seed}`;
    }
    if (code) {
      return `小红书博主主页抓取失败（${code}：${err.message}）。链接：${seed}`;
    }
    return `小红书博主主页抓取失败：${err.message}。链接：${seed}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort|timeout|timed out/i.test(msg)) {
    return `小红书 MCP 请求超时（${PROFILE_REQUEST_MS / 1000}s）。请确认 MCP 与 ngrok 窗口仍打开。链接：${seed}`;
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)) {
    return `小红书 MCP 不可达。请启动 bash scripts/start-xhs-mcp-mac.sh 并核对 Vercel 的 XHS_MCP_BASE_URL。`;
  }
  return `小红书博主主页抓取失败：${msg}。链接：${seed}`;
}

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

async function xhsMcpFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const base = getXhsMcpBaseUrl();
  if (!base) throw new XhsMcpError("missing_xhs_mcp_base_url");

  const timeoutMs = init?.timeoutMs ?? REQUEST_MS;
  const { timeoutMs: _drop, ...fetchInit } = init ?? {};

  const res = await fetch(`${base}${path}`, {
    ...fetchInit,
    signal: fetchInit.signal ?? AbortSignal.timeout(timeoutMs),
    headers: {
      ...XHS_MCP_HEADERS,
      ...(fetchInit.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as McpSuccess<T>;
  if (!res.ok) {
    const msg = body.error || body.message || `xhs_mcp_http_${res.status}`;
    throw new XhsMcpError(msg, {
      code: body.code,
      details: body.details,
      httpStatus: res.status,
    });
  }
  if (body.success === false) {
    throw new XhsMcpError(body.error || body.message || "xhs_mcp_failed", {
      code: body.code,
      details: body.details,
      httpStatus: res.status,
    });
  }
  return (body.data ?? body) as T;
}

export async function getXhsMcpLoginStatus(): Promise<{ loggedIn: boolean; message?: string }> {
  const base = getXhsMcpBaseUrl();
  if (!base) return { loggedIn: false, message: "未配置 XHS_MCP_BASE_URL" };

  // 已登录时 qrcode 接口通常比 status 更快（status 会启动浏览器，易在 Vercel 上超时）
  try {
    const res = await fetch(`${base}/api/v1/login/qrcode`, {
      headers: XHS_MCP_HEADERS,
      signal: AbortSignal.timeout(LOGIN_PROBE_MS),
    });
    const body = (await res.json().catch(() => ({}))) as McpSuccess<{
      is_logged_in?: boolean;
      status?: string;
      message?: string;
    }>;
    const data = (body.data ?? body) as { is_logged_in?: boolean; status?: string; message?: string };
    if (data.is_logged_in === true || data.status === "logged_in") {
      return { loggedIn: true, message: data.message ?? body.message };
    }
    if (res.ok && body.success !== false) {
      return { loggedIn: false, message: data.message ?? "需要扫码登录小红书" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "xhs_mcp_unreachable";
    if (!/abort|timeout|timed out/i.test(msg)) {
      return { loggedIn: false, message: msg };
    }
  }

  try {
    const data = await xhsMcpFetch<{ is_logged_in?: boolean; logged_in?: boolean; message?: string }>(
      "/api/v1/login/status",
      { method: "GET", signal: AbortSignal.timeout(60_000) },
    );
    const loggedIn = data.is_logged_in === true || data.logged_in === true;
    return { loggedIn, message: data.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "xhs_mcp_unreachable";
    return { loggedIn: false, message: msg };
  }
}

function isLoginCheckUncertain(message?: string): boolean {
  if (!message) return false;
  return /abort|timeout|timed out|fetch failed/i.test(message);
}

async function fetchXhsUserProfile(userId: string, xsecToken: string): Promise<XhsUserProfileData> {
  return xhsMcpFetch<XhsUserProfileData>("/api/v1/user/profile", {
    method: "POST",
    timeoutMs: PROFILE_REQUEST_MS,
    body: JSON.stringify({ user_id: userId, xsec_token: xsecToken }),
  });
}

async function fetchXhsUserProfileWithRetry(
  rawSeed: string,
  profile: ParsedXhsProfile,
): Promise<XhsUserProfileData> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= PROFILE_FETCH_ATTEMPTS; attempt += 1) {
    let resolved = rawSeed.trim();
    let userId = profile.userId;
    let xsecToken = profile.xsecToken;

    if (attempt > 1 || /xhslink\.com/i.test(resolved)) {
      resolved = await resolveBrowseSeedUrl(resolved);
      const reparsed = parseXhsProfileUrl(resolved);
      if (reparsed) {
        userId = reparsed.userId;
        if (reparsed.xsecToken) xsecToken = reparsed.xsecToken;
      }
    }

    try {
      return await fetchXhsUserProfile(userId, xsecToken);
    } catch (e) {
      lastErr = e;
      console.warn(`[browse-xhs-mcp] user profile attempt ${attempt}/${PROFILE_FETCH_ATTEMPTS} failed:`, resolved, e);
      if (attempt < PROFILE_FETCH_ATTEMPTS) {
        await sleep(PROFILE_RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastErr;
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
  meta?: { profileSeed?: string; bloggerName?: string },
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
    xhsBloggerName: meta?.bloggerName ?? profileNickname ?? author,
    xhsProfileSeed: meta?.profileSeed ?? null,
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
  if (!login.loggedIn && !isLoginCheckUncertain(login.message)) {
    return {
      hits: [],
      warnings: [
        login.message?.includes("ECONNREFUSED") || login.message?.includes("fetch failed")
          ? `小红书 MCP 服务不可用（${base}）。请先启动 bash scripts/start-xhs-mcp-mac.sh`
          : "小红书 MCP 未登录。请访问 /xhs-login 扫码登录后再刷新随览。",
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
      profileData = await fetchXhsUserProfileWithRetry(raw, profile);
    } catch (e) {
      console.warn("[browse-xhs-mcp] user profile failed:", resolved, e);
      warnings.push(formatXhsProfileWarning(raw, e));
      continue;
    }

    const nickname = profileData.userBasicInfo?.nickname?.trim();
    const feeds = profileData.feeds ?? [];
    if (!feeds.length) {
      warnings.push(nickname ? `博主「${nickname}」未返回笔记列表。` : "博主主页未返回笔记列表。");
      continue;
    }

    const bloggerLabel = nickname || profile.userId;
    let profileHitCount = 0;
    for (const item of feeds) {
      if (profileHitCount >= limit) break;
      const feedId = item.id?.trim();
      if (!feedId || seenFeed.has(feedId)) continue;
      seenFeed.add(feedId);
      const token = (item.xsecToken || profile.xsecToken).trim();
      const meta = { profileSeed: resolved, bloggerName: bloggerLabel };
      let hit = feedItemToBrowseHit(item, nickname, undefined, meta);
      if (!hit) continue;

      try {
        const detail = await fetchXhsFeedDetail(feedId, token);
        const enriched = feedItemToBrowseHit(item, nickname, detail, meta);
        if (enriched) hit = enriched;
      } catch {
        /* 保留列表页标题，详情失败仍入库 */
      }
      hits.push(hit);
      profileHitCount += 1;
    }
  }

  return { hits, warnings: [...new Set(warnings)] };
}
