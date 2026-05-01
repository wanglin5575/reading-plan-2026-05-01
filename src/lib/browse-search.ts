import FirecrawlApp from "@mendable/firecrawl-js";
import type { BrowseHit, BrowseTopic } from "@/lib/types";
import type { Document, SearchData, SearchResultWeb } from "@mendable/firecrawl-js";

export function browseTopicToQuery(topic: Pick<BrowseTopic, "name" | "keywords">): string {
  const kws = topic.keywords.map((k) => k.trim()).filter(Boolean);
  const escaped = kws.map((k) => {
    if (/[\s"&|()]/.test(k)) return `"${k.replace(/"/g, '\\"')}"`;
    return k;
  });
  return `${topic.name} (${escaped.join(" OR ")})`;
}

function isFullDocument(item: SearchResultWeb | Document): item is Document {
  return "markdown" in item || "html" in item || !!(item as Document).metadata;
}

/** Google 自定义日期区间 tbs：按本地日历日的 0 点比较 */
export function browseTbsForWindow(since: Date, until: Date): string {
  const s = since.getTime();
  const u = until.getTime();
  const start = s <= u ? since : until;
  const end = s <= u ? until : since;

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  if (startDay.getTime() === endDay.getTime()) {
    return "qdr:d";
  }
  return `cdr:1,cd_min:${fmt(startDay)},cd_max:${fmt(endDay)}`;
}

/**
 * Firecrawl v2 search：since～until 时间窗（同日用 qdr:d，跨日用 cdr）。
 * 若无结果则去掉 tbs 再搜一次；客户端仍会用 publishedTime 相对 since 过滤合并。
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
    limit: 18,
    tbs,
    scrapeOptions,
  });

  let hits = toHits(data);
  if (!hits.length) {
    const dataWide = await app.search(query, {
      limit: 18,
      scrapeOptions,
    });
    hits = toHits(dataWide);
  }

  return hits;
}
