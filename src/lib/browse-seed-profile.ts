import FirecrawlApp from "@mendable/firecrawl-js";
import type { Document, ScrapeOptions } from "@mendable/firecrawl-js";
import type { BrowseHit } from "@/lib/types";
import { pickAuthorFromMetadata } from "@/lib/browse-attribution";
import { normalizePublishedToIso, resolveBrowsePublishedTime } from "@/lib/browse-published";
import { detectMediaKindFromSignals, detectMediaKindFromUrl, extractDurationSecondsFromMetadataDeep } from "@/lib/media-kind";
import { detectLanguage, estimateReadingMinutesCalibrated } from "@/lib/classify";
import { isLikelyRichMediaPageUrl } from "@/lib/scrape";
import { fetchBrowseXhsMcpHits, isXhsProfileSeedUrl } from "@/lib/browse-xhs-mcp";

const RESOLVE_MS = 15000;
const PROFILE_DISCOVER_LIMIT = 80;
export const PROFILE_SCRAPE_BOOTSTRAP = 30;
export const PROFILE_SCRAPE_INCREMENTAL = 15;

type ProfilePlatform = "xiaohongshu" | "bilibili" | "douyin" | "weibo" | "zhihu" | "medium" | "substack" | "tiktok" | "generic";

const PROFILE_HOST_RE =
  /(^|\.)((?:xhslink|xiaohongshu)\.com|bilibili\.com|douyin\.com|weibo\.com|zhihu\.com|medium\.com|substack\.com|tiktok\.com)$/i;

function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeCandidateUrl(raw: string, profileUrl: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const base = new URL(profileUrl);
    const u = t.startsWith("http") ? new URL(t) : new URL(t, base.origin);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function detectProfilePlatform(url: string): ProfilePlatform | null {
  const h = hostKey(url);
  if (!h) return null;
  if (/xhslink|xiaohongshu/.test(h)) {
    if (/\/user\/profile\//i.test(url)) return "xiaohongshu";
    return null;
  }
  if (h.endsWith("bilibili.com") && /\/space\//i.test(url)) return "bilibili";
  if (h.endsWith("douyin.com") && /\/user\//i.test(url)) return "douyin";
  if (h.endsWith("weibo.com") && (/\/u\/\d+/i.test(url) || /\/n\/[^/?#]+/i.test(url))) return "weibo";
  if (h.endsWith("zhihu.com") && /\/people\//i.test(url)) return "zhihu";
  if (h.endsWith("medium.com") && /\/@[^/?#]+/i.test(url)) return "medium";
  if (h.endsWith("substack.com") && !/\/p\//i.test(url)) return "substack";
  if (h.endsWith("tiktok.com") && /\/@[^/?#]+/i.test(url)) return "tiktok";
  return null;
}

/** 种子是否为博主主页（而非 RSS / 整站域名） */
export function isBrowseProfileSeedUrl(seed: string): boolean {
  const s = seed.trim();
  if (!s || !/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    if (!PROFILE_HOST_RE.test(u.hostname)) return false;
    return detectProfilePlatform(u.toString()) !== null;
  } catch {
    return false;
  }
}

/** 短链（如 xhslink）解析为最终 URL */
export async function resolveBrowseSeedUrl(seed: string): Promise<string> {
  const s = seed.trim();
  if (!/^https?:\/\//i.test(s)) return s;
  let host = "";
  try {
    host = new URL(s).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return s;
  }
  if (!/(^|\.)xhslink\.com$/.test(host)) return s;
  try {
    const res = await fetch(s, {
      redirect: "follow",
      signal: AbortSignal.timeout(RESOLVE_MS),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });
    return res.url?.trim() || s;
  } catch {
    return s;
  }
}

export async function partitionBrowseSeeds(seeds: string[]): Promise<{ profileSeeds: string[]; feedSeeds: string[] }> {
  const profileSeeds: string[] = [];
  const feedSeeds: string[] = [];
  const seenProfile = new Set<string>();

  for (const raw of seeds) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const resolved = await resolveBrowseSeedUrl(trimmed);
    if (isBrowseProfileSeedUrl(resolved)) {
      const key = resolved.replace(/\/$/, "").toLowerCase();
      if (!seenProfile.has(key)) {
        seenProfile.add(key);
        profileSeeds.push(resolved);
      }
    } else {
      feedSeeds.push(trimmed);
    }
  }

  return { profileSeeds, feedSeeds };
}

function isNoteUrlForPlatform(platform: ProfilePlatform, url: string, profileUrl: string): boolean {
  const h = hostKey(url);
  const profileHost = hostKey(profileUrl);
  switch (platform) {
    case "xiaohongshu":
      return /xiaohongshu\.com/i.test(h) && /\/(?:explore|discovery\/item)\/[0-9a-zA-Z]+/i.test(url);
    case "bilibili":
      return /bilibili\.com/i.test(h) && /\/video\/(?:BV|av)/i.test(url);
    case "douyin":
      return /douyin\.com/i.test(h) && /\/video\//i.test(url);
    case "weibo":
      return /weibo\.com/i.test(h) && /\/(?:status|detail)\//i.test(url);
    case "zhihu":
      return /zhihu\.com/i.test(h) && /\/(?:p|question\/\d+\/answer)\//i.test(url);
    case "medium":
      return /medium\.com/i.test(h) && !/\/@[^/?#]+\/?$/.test(url.replace(/\?.*$/, ""));
    case "substack":
      return profileHost === h && /\/p\//i.test(url);
    case "tiktok":
      return /tiktok\.com/i.test(h) && /\/video\//i.test(url);
    default:
      return h === profileHost && url.replace(/\/$/, "") !== profileUrl.replace(/\/$/, "");
  }
}

function isXhsLoginWall(blob: string): boolean {
  return /登录即可查看\s*Ta\s*的笔记|登录后推荐更懂你的笔记|新用户可直接登录/.test(blob);
}

function extractUrlsFromText(blob: string, profileUrl: string, platform: ProfilePlatform): string[] {
  const found = new Set<string>();
  const re = /https?:\/\/[^\s"'<>)\]]+/gi;
  for (const m of blob.matchAll(re)) {
    const normalized = normalizeCandidateUrl(m[0].replace(/[),.;]+$/, ""), profileUrl);
    if (normalized && isNoteUrlForPlatform(platform, normalized, profileUrl)) found.add(normalized);
  }
  return [...found];
}

function collectLinksFromDoc(doc: Document | undefined, profileUrl: string, platform: ProfilePlatform): string[] {
  const out = new Set<string>();
  for (const raw of doc?.links ?? []) {
    const u = normalizeCandidateUrl(raw, profileUrl);
    if (u && isNoteUrlForPlatform(platform, u, profileUrl)) out.add(u);
  }
  const blob = `${doc?.markdown ?? ""}\n${doc?.rawHtml ?? ""}\n${doc?.html ?? ""}`;
  for (const u of extractUrlsFromText(blob, profileUrl, platform)) out.add(u);
  return [...out];
}

function profileScrapeOptions(platform: ProfilePlatform): ScrapeOptions {
  const rich = platform === "xiaohongshu" || platform === "douyin" || platform === "tiktok";
  const scrolls = rich ? 8 : 4;
  return {
    formats: ["links", "markdown", "rawHtml"],
    onlyMainContent: false,
    waitFor: rich ? 12000 : 8000,
    mobile: rich,
    proxy: rich ? "auto" : undefined,
    actions: [
      { type: "wait", milliseconds: rich ? 6000 : 3000 },
      ...Array.from({ length: scrolls }, () => ({ type: "scroll" as const, direction: "down" as const })),
      { type: "wait", milliseconds: 2000 },
    ],
  };
}

async function discoverProfileNoteUrls(
  app: FirecrawlApp,
  profileUrl: string,
): Promise<{ notes: string[]; warning?: string }> {
  const platform = detectProfilePlatform(profileUrl);
  if (!platform) return { notes: [] };

  const discovered = new Set<string>();
  let profileMarkdown = "";

  try {
    const doc = await app.scrape(profileUrl, profileScrapeOptions(platform));
    profileMarkdown = `${doc?.markdown ?? ""}\n${doc?.rawHtml ?? ""}`;
    for (const u of collectLinksFromDoc(doc, profileUrl, platform)) discovered.add(u);
  } catch (err) {
    console.warn("[browse-profile] scrape profile failed:", profileUrl, err);
  }

  if (platform === "xiaohongshu" && isXhsLoginWall(profileMarkdown) && discovered.size === 0) {
    return {
      notes: [],
      warning:
        "小红书博主主页需登录才能查看笔记列表，当前无法批量抓取。可改为添加单篇笔记链接，或使用其他平台博主主页。",
    };
  }

  if (discovered.size < 8) {
    try {
      const mapped = await app.map(profileUrl, { limit: PROFILE_DISCOVER_LIMIT, includeSubdomains: true });
      for (const item of mapped.links ?? []) {
        const u = normalizeCandidateUrl(item.url, profileUrl);
        if (u && isNoteUrlForPlatform(platform, u, profileUrl)) discovered.add(u);
      }
    } catch (err) {
      console.warn("[browse-profile] map profile failed:", profileUrl, err);
    }
  }

  if (platform === "xiaohongshu" && isXhsLoginWall(profileMarkdown) && discovered.size === 0) {
    return {
      notes: [],
      warning:
        "小红书博主主页需登录才能查看笔记列表，当前无法批量抓取。可改为添加单篇笔记链接，或使用其他平台博主主页。",
    };
  }

  return { notes: [...discovered].slice(0, PROFILE_DISCOVER_LIMIT) };
}

function documentToBrowseHit(doc: Document): BrowseHit | null {
  const meta = doc.metadata;
  const url = (meta?.sourceURL || meta?.ogUrl || "").trim();
  if (!url) return null;
  const title = (meta?.title || meta?.ogTitle || "无标题").trim();
  const description = (meta?.description || meta?.ogDescription || "").trim();
  const md = (doc.markdown || "").trim();
  const excerpt = md ? md.slice(0, 480).replace(/\s+/g, " ") : description;
  const html = typeof doc.rawHtml === "string" ? doc.rawHtml : typeof doc.html === "string" ? doc.html : undefined;
  const publishedTime =
    resolveBrowsePublishedTime({ meta, markdown: md, rawHtml: html, json: doc.json }) ?? null;
  const authorRaw = pickAuthorFromMetadata(meta);
  const durationSec = meta ? extractDurationSecondsFromMetadataDeep(meta as Record<string, unknown>) : null;
  const mediaType = meta
    ? detectMediaKindFromSignals(url, typeof meta.ogType === "string" ? meta.ogType : undefined, title, {
        bodySample: `${description}\n${excerpt}`,
        durationSeconds: durationSec,
      })
    : detectMediaKindFromUrl(url);
  const lang = detectLanguage(`${title}\n${excerpt}`);
  const estimatedMinutes = estimateReadingMinutesCalibrated(title, excerpt, description, lang, {
    mediaKind: mediaType,
    durationSeconds: durationSec,
  });
  return {
    url,
    title,
    description,
    summary: description,
    excerpt: excerpt || description,
    mediaType,
    publishedTime,
    author: authorRaw,
    estimatedMinutes,
    fullMarkdownForAi: md.replace(/\s+/g, " ").trim().slice(0, 12000),
  };
}

function noteScrapeOptions(url: string): ScrapeOptions {
  const rich = isLikelyRichMediaPageUrl(url);
  return rich
    ? { formats: ["markdown"], onlyMainContent: false, waitFor: 10000, mobile: true, proxy: "auto" }
    : { formats: ["markdown"], onlyMainContent: false, waitFor: 5000 };
}

export type FetchBrowseProfileResult = {
  hits: BrowseHit[];
  warnings: string[];
};

/**
 * 从博主主页种子发现笔记/文章 URL，并批量抓取为 BrowseHit（非小红书平台）。
 * 小红书主页种子请走 fetchBrowseXhsMcpHits。
 */
async function fetchBrowseFirecrawlProfileHits(
  profileSeeds: string[],
  options?: { bootstrap?: boolean },
): Promise<FetchBrowseProfileResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey || !profileSeeds.length) return { hits: [], warnings: [] };

  const app = new FirecrawlApp({ apiKey });
  const scrapeLimit = options?.bootstrap ? PROFILE_SCRAPE_BOOTSTRAP : PROFILE_SCRAPE_INCREMENTAL;
  const allNoteUrls = new Set<string>();
  const warnings: string[] = [];

  for (const profileUrl of profileSeeds) {
    const { notes, warning } = await discoverProfileNoteUrls(app, profileUrl);
    if (warning) warnings.push(warning);
    for (const u of notes) allNoteUrls.add(u);
  }

  const urls = [...allNoteUrls].slice(0, scrapeLimit);
  if (!urls.length) return { hits: [], warnings: [...new Set(warnings)] };

  const hits: BrowseHit[] = [];
  const batchSize = 5;
  for (let i = 0; i < urls.length; i += batchSize) {
    const chunk = urls.slice(i, i + batchSize);
    try {
      const job = await app.batchScrape(chunk, {
        options: noteScrapeOptions(chunk[0] ?? ""),
        maxConcurrency: 3,
      });
      for (const doc of job.data ?? []) {
        const hit = documentToBrowseHit(doc);
        if (hit) hits.push(hit);
      }
    } catch (err) {
      console.warn("[browse-profile] batch scrape failed:", err);
      for (const url of chunk) {
        try {
          const doc = await app.scrape(url, noteScrapeOptions(url));
          const hit = documentToBrowseHit(doc);
          if (hit) hits.push(hit);
        } catch {
          hits.push({
            url,
            title: url,
            description: "",
            summary: "",
            excerpt: "",
            mediaType: detectMediaKindFromUrl(url),
            publishedTime: null,
            author: null,
            estimatedMinutes: 5,
          });
        }
      }
    }
  }

  const byUrl = new Map<string, BrowseHit>();
  for (const h of hits) {
    const u = h.url.trim();
    if (u && !byUrl.has(u)) byUrl.set(u, h);
  }
  return { hits: [...byUrl.values()], warnings: [...new Set(warnings)] };
}

/** 博主主页种子：小红书走 MCP，其余走 Firecrawl */
export async function fetchBrowseProfileHits(
  profileSeeds: string[],
  options?: { bootstrap?: boolean },
): Promise<FetchBrowseProfileResult> {
  const xhsSeeds = profileSeeds.filter((s) => isXhsProfileSeedUrl(s));
  const otherSeeds = profileSeeds.filter((s) => !isXhsProfileSeedUrl(s));

  const [xhsResult, fcResult] = await Promise.all([
    xhsSeeds.length ? fetchBrowseXhsMcpHits(xhsSeeds, options) : Promise.resolve({ hits: [], warnings: [] }),
    otherSeeds.length ? fetchBrowseFirecrawlProfileHits(otherSeeds, options) : Promise.resolve({ hits: [], warnings: [] }),
  ]);

  const byUrl = new Map<string, BrowseHit>();
  for (const h of [...xhsResult.hits, ...fcResult.hits]) {
    const u = h.url.trim();
    if (u && !byUrl.has(u)) byUrl.set(u, h);
  }

  return {
    hits: [...byUrl.values()],
    warnings: [...new Set([...xhsResult.warnings, ...fcResult.warnings])],
  };
}
