import FirecrawlApp from "@mendable/firecrawl-js";
import type { BrowseHit, BrowseTopic } from "@/lib/types";
import type { Document, SearchData, SearchResultWeb } from "@mendable/firecrawl-js";
import { browseTopicToQuery } from "@/lib/browse-query";

/** 主搜：条数少一些省抓取配额 */
const BROWSE_SEARCH_LIMIT_PRIMARY = 10;
/** 补搜：更少条数、且不抓取正文，显著省额度 */
const BROWSE_SEARCH_LIMIT_FALLBACK = 6;
/** 与「上次刷新」间隔过长时，cdr 窗最多向前覆盖的天数，避免又大又难搜的区间 */
const BROWSE_CDR_MAX_SPAN_DAYS = 21;

export { browseTopicToQuery };

function isFullDocument(item: SearchResultWeb | Document): item is Document {
  return "markdown" in item || "html" in item || !!(item as Document).metadata;
}

const DAY_MS = 86400000;

/**
 * Google tbs：偏宽、易出结果，又控制区间别无限拉大。
 * - 同一天内：用 qdr:w（约一周），比 qdr:d 宽松很多
 * - 跨日：cdr，且 since 若过早则截断为距 until 最多 BROWSE_CDR_MAX_SPAN_DAYS 天
 */
export function browseTbsForWindow(since: Date, until: Date): string {
  const s = since.getTime();
  const u = until.getTime();
  const start = s <= u ? since : until;
  const end = s <= u ? until : since;

  let rangeStart = start;
  const spanMs = end.getTime() - rangeStart.getTime();
  if (spanMs > BROWSE_CDR_MAX_SPAN_DAYS * DAY_MS) {
    rangeStart = new Date(end.getTime() - BROWSE_CDR_MAX_SPAN_DAYS * DAY_MS);
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
 * Firecrawl v2 search：
 * 1）主搜：较宽 tbs + 少量条数 + scrape（摘要/节选质量）
 * 2）仍无结果：补搜不加 scrape、更少条数，省配额且常能拿到 SERP 摘要
 */
export async function fetchBrowseHits(
  topic: Pick<BrowseTopic, "name" | "keywords">,
  options: { since: Date; until?: Date },
): Promise<BrowseHit[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new Error("missing_firecrawl");

  const app = new FirecrawlApp({ apiKey });
  const query = browseTopicToQuery(topic);
  const until = options.until ?? new Date();
  const tbs = browseTbsForWindow(options.since, until);

  const scrapeOptions = {
    formats: ["markdown" as const],
    onlyMainContent: true,
  };

  const toHits = (data: SearchData): BrowseHit[] => {
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
        hits.push({
          url,
          title: (w.title || "无标题").trim(),
          description,
          summary: description,
          excerpt: description,
          publishedTime: null,
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
      const publishedRaw = meta?.publishedTime;
      const publishedTime =
        typeof publishedRaw === "string" && publishedRaw.trim() ? publishedRaw.trim() : null;
      hits.push({
        url,
        title,
        description,
        summary,
        excerpt: excerpt || description,
        publishedTime,
      });
    }

    return hits;
  };

  const data = await app.search(query, {
    limit: BROWSE_SEARCH_LIMIT_PRIMARY,
    tbs,
    scrapeOptions,
  });

  let hits = toHits(data);
  if (!hits.length) {
    const dataLite = await app.search(query, {
      limit: BROWSE_SEARCH_LIMIT_FALLBACK,
    });
    hits = toHits(dataLite);
  }

  return hits;
}
