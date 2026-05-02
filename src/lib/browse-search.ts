import type { MediaKind } from "@/lib/media-kind";
import FirecrawlApp from "@mendable/firecrawl-js";
import type { BrowseHit, BrowseTopic } from "@/lib/types";
import type { Document, SearchData, SearchResultNews, SearchResultWeb, ScrapeOptions } from "@mendable/firecrawl-js";
import { browseTopicToQuery } from "@/lib/browse-query";
import { pickAuthorFromMetadata } from "@/lib/browse-attribution";
import {
  normalizeBrowseUrlKey,
  normalizePublishedToIso,
  resolveBrowsePublishedTime,
} from "@/lib/browse-published";
import {
  detectLanguage,
  estimateReadingMinutesCalibrated,
} from "@/lib/classify";
import {
  detectMediaKindFromSignals,
  detectMediaKindFromUrl,
  extractDurationSecondsFromMetadataDeep,
} from "@/lib/media-kind";

/** 主搜：条数少一些省抓取配额 */
const BROWSE_SEARCH_LIMIT_PRIMARY = 10;
/** 补搜：更少条数、且不抓取正文，显著省额度 */
const BROWSE_SEARCH_LIMIT_FALLBACK = 6;
/** 与「上次刷新」间隔过长时，cdr 窗最多向前覆盖的天数（增量刷新） */
export const BROWSE_TBS_MAX_DAYS_INCREMENTAL = 21;

/** 首次刷新（主题尚无成功抓取记录）时 Google cdr 窗最多覆盖约 3 个月，偏向近期文章 */
export const BROWSE_TBS_MAX_DAYS_BOOTSTRAP = 92;

export { browseTopicToQuery };

function resolveHitMediaKind(
  url: string,
  title: string,
  meta: unknown | undefined,
  bodySample: string,
): MediaKind {
  const metaRec = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : undefined;
  const durationSec = metaRec ? extractDurationSecondsFromMetadataDeep(metaRec) : null;
  return metaRec
    ? detectMediaKindFromSignals(url, metaOgType(metaRec), title, {
        bodySample,
        durationSeconds: durationSec,
      })
    : detectMediaKindFromUrl(url);
}

function metaOgType(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  for (const k of ["og:type", "ogType"]) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function estimateBrowseReadMinutes(
  url: string,
  title: string,
  summary: string,
  excerpt: string,
  description: string,
  meta: unknown | undefined,
): number {
  const body = `${title}\n${summary}\n${excerpt}\n${description}`;
  const lang = detectLanguage(body);
  const metaRec = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : undefined;
  const durationSec = metaRec ? extractDurationSecondsFromMetadataDeep(metaRec) : null;
  const kind = metaRec
    ? detectMediaKindFromSignals(url, metaOgType(metaRec), title, {
        bodySample: `${description}\n${excerpt}\n${summary}`,
        durationSeconds: durationSec,
      })
    : detectMediaKindFromUrl(url);
  return estimateReadingMinutesCalibrated(title, excerpt || summary, summary || description, lang, {
    mediaKind: kind,
    durationSeconds: durationSec,
  });
}

function isFullDocument(item: SearchResultWeb | Document): item is Document {
  return "markdown" in item || "html" in item || !!(item as Document).metadata;
}

function isLikelyNewsHit(item: object): item is SearchResultNews {
  if ("markdown" in item || "rawHtml" in item) return false;
  if (!("url" in item) || typeof (item as SearchResultNews).url !== "string") return false;
  const d = (item as SearchResultNews).date;
  return typeof d === "string" && Boolean(d.trim());
}

function collectNewsPublishedByUrl(data: SearchData): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of data.news ?? []) {
    if (!item || typeof item !== "object") continue;
    if (isLikelyNewsHit(item)) {
      const u = (item.url || "").trim();
      const d = (item.date || "").trim();
      if (!u || !d) continue;
      const iso = normalizePublishedToIso(d);
      if (iso) map.set(normalizeBrowseUrlKey(u), iso);
    }
  }
  return map;
}

const DAY_MS = 86400000;

/**
 * Google tbs：偏宽、易出结果，又控制区间别无限拉大。
 * - 同一天内：用 qdr:w（约一周），比 qdr:d 宽松很多
 * - 跨日：cdr，且 since 若过早则截断为距 until 最多 maxSpanDays 天
 */
export function browseTbsForWindow(since: Date, until: Date, maxSpanDays = BROWSE_TBS_MAX_DAYS_INCREMENTAL): string {
  const s = since.getTime();
  const u = until.getTime();
  const start = s <= u ? since : until;
  const end = s <= u ? until : since;

  let rangeStart = start;
  const spanMs = end.getTime() - rangeStart.getTime();
  if (spanMs > maxSpanDays * DAY_MS) {
    rangeStart = new Date(end.getTime() - maxSpanDays * DAY_MS);
  }

  const startDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  if (startDay.getTime() === endDay.getTime()) {
    return "qdr:w";
  }
  return `cdr:1,cd_min:${fmt(startDay)},cd_max:${fmt(endDay)}`;
}

/**
 * Firecrawl v2 search（A：优先 News 再补 Web，减轻「全是陈旧网页」）：
 * 1）先搜 news → 再搜 web（按 URL 去重，保留 news 在前）
 * 2）仍全无结果：fallback 为单次 web+news 合并（兼容索引稀疏的关键词）
 */
export async function fetchBrowseHits(
  topic: Pick<BrowseTopic, "name" | "keywords" | "seedSources">,
  options: { since: Date; until?: Date; tbsMaxSpanDays?: number },
): Promise<BrowseHit[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new Error("missing_firecrawl");

  const app = new FirecrawlApp({ apiKey });
  const query = browseTopicToQuery(topic);
  const until = options.until ?? new Date();
  const tbs = browseTbsForWindow(options.since, until, options.tbsMaxSpanDays ?? BROWSE_TBS_MAX_DAYS_INCREMENTAL);

  const scrapeOptions: ScrapeOptions = {
    formats: ["markdown", "rawHtml"],
    /** false：保留页头/脚本区转写，便于从 HTML/markdown 中解析 pubdate、JSON-LD */
    onlyMainContent: false,
  };

  const toHits = (data: SearchData): BrowseHit[] => {
    const newsMap = collectNewsPublishedByUrl(data);

    const web = data.web ?? [];
    const seen = new Set<string>();
    const hits: BrowseHit[] = [];

    for (const item of web) {
      if (!item || typeof item !== "object") continue;

      if (!isFullDocument(item)) {
        const w = item as SearchResultWeb;
        const url = (w.url || "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const description = (w.description || "").trim();
        const wTitle = (w.title || "无标题").trim();
        const est = estimateBrowseReadMinutes(url, wTitle, description, description, description, undefined);
        const publishedTime =
          resolveBrowsePublishedTime({
            serpDescription: description,
            newsDate: newsMap.get(normalizeBrowseUrlKey(url)) ?? null,
          }) ?? null;
        hits.push({
          url,
          title: wTitle,
          description,
          summary: description,
          excerpt: description,
          mediaType: resolveHitMediaKind(url, wTitle, undefined, `${description}\n${description}`),
          publishedTime,
          author: null,
          estimatedMinutes: est,
        });
        continue;
      }

      const doc = item;
      const meta = doc.metadata;
      const url = (meta?.sourceURL || meta?.ogUrl || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = (meta?.title || meta?.ogTitle || "无标题").trim();
      const description = (meta?.description || meta?.ogDescription || "").trim();
      const md = (doc.markdown || "").trim();
      const excerpt = md ? md.slice(0, 480).replace(/\s+/g, " ") : "";
      const docSummary =
        typeof (doc as { summary?: unknown }).summary === "string"
          ? ((doc as { summary: string }).summary || "").trim()
          : "";
      const summary = docSummary || description;
      const html = typeof doc.rawHtml === "string" ? doc.rawHtml : typeof doc.html === "string" ? doc.html : undefined;
      const publishedTime =
        resolveBrowsePublishedTime({
          meta,
          markdown: md,
          rawHtml: html,
          json: doc.json,
          serpDescription: description,
          newsDate: newsMap.get(normalizeBrowseUrlKey(url)) ?? null,
        }) ?? null;
      const authorRaw = pickAuthorFromMetadata(meta);
      const est = estimateBrowseReadMinutes(url, title, summary, excerpt || description, description, meta);
        hits.push({
          url,
          title,
          description,
          summary,
          excerpt: excerpt || description,
          mediaType: resolveHitMediaKind(url, title, meta, `${description}\n${excerpt || ""}`),
          publishedTime,
          author: authorRaw,
          estimatedMinutes: est,
          /** 供 WolfAI：与 ai-summary 输入上限对齐 */
          fullMarkdownForAi: md.replace(/\s+/g, " ").trim().slice(0, 12000),
        });
    }

    return hits;
  };

  const dataNews = await app.search(query, {
    limit: BROWSE_SEARCH_LIMIT_PRIMARY,
    tbs,
    sources: ["news"],
    scrapeOptions,
  });
  const newsHits = toHits(dataNews);

  const dataWeb = await app.search(query, {
    limit: BROWSE_SEARCH_LIMIT_PRIMARY,
    tbs,
    sources: ["web"],
    scrapeOptions,
  });
  const webHits = toHits(dataWeb);

  const seen = new Set<string>();
  const merged: BrowseHit[] = [];
  for (const h of newsHits) {
    const u = h.url.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    merged.push(h);
  }
  for (const h of webHits) {
    const u = h.url.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    merged.push(h);
  }

  let hits = merged;
  if (!hits.length) {
    const dataFallback = await app.search(query, {
      limit: BROWSE_SEARCH_LIMIT_FALLBACK,
      tbs,
      sources: ["web", "news"],
      scrapeOptions,
    });
    hits = toHits(dataFallback);
    if (!hits.length) {
      const dataLite = await app.search(query, {
        limit: BROWSE_SEARCH_LIMIT_FALLBACK,
        tbs,
        sources: ["web", "news"],
      });
      hits = toHits(dataLite);
    }
  }

  return hits;
}
