import type { BrowseHit } from "@/lib/types";
import { detectMediaKindFromUrl } from "@/lib/media-kind";
import { normalizePublishedToIso } from "@/lib/browse-published";
import { isBrowseProfileSeedUrl } from "@/lib/browse-seed-profile";

const FETCH_MS = 12000;
const MAX_ITEMS_PER_FEED = 12;

/** 从种子串解析出用于请求的候选 Feed URL（RSS/Atom 或常见路径探测） */
export function candidateFeedUrls(seed: string): string[] {
  const s = seed.trim();
  if (!s) return [];
  if (/^https?:\/\//i.test(s)) {
    const base = s.replace(/\/$/, "");
    if (/\.(xml|rss|atom)(\?|$)/i.test(base)) return [base];
    return [`${base}/feed`, `${base}/feed.xml`, `${base}/rss.xml`, `${base}/rss`, `${base}/atom.xml`, base];
  }
  return [`https://${s.replace(/^\/+/, "")}/feed`, `https://${s}/rss.xml`];
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 极简 RSS 2.0 / Atom 抽取（避免额外依赖） */
function parseFeedXml(xml: string): Array<{ title: string; link: string; isoDate: string | null }> {
  const out: Array<{ title: string; link: string; isoDate: string | null }> = [];
  const isAtom = /<feed[\s>]/.test(xml.slice(0, 2000));

  if (isAtom) {
    const entryRe = /<entry\b([^>]*)>([\s\S]*?)<\/entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      const block = m[2] ?? "";
      const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
      const linkM =
        /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i.exec(block) ||
        /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
      const updated =
        /<updated[^>]*>([\s\S]*?)<\/updated>/i.exec(block) ||
        /<published[^>]*>([\s\S]*?)<\/published>/i.exec(block);
      const title = titleM ? stripTags(titleM[1] ?? "") : "";
      const link = (linkM?.[1] ?? "").trim();
      const rawD = updated?.[1]?.trim();
      const iso = rawD ? normalizePublishedToIso(rawD) : null;
      if (title && link.startsWith("http")) out.push({ title, link, isoDate: iso });
    }
    return out.slice(0, MAX_ITEMS_PER_FEED);
  }

  const itemRe = /<item\b([^>]*)>([\s\S]*?)<\/item>/gi;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(xml)) !== null) {
    const block = im[2] ?? "";
    const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const linkM = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
    const pubM = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(block);
    const title = titleM ? stripTags(titleM[1] ?? "") : "";
    let link = (linkM?.[1] ?? "").trim();
    const guidM = /<guid[^>]*>([\s\S]*?)<\/guid>/i.exec(block);
    if (!link && guidM?.[1]?.trim().startsWith("http")) link = stripTags(guidM[1]);
    const rawD = pubM?.[1]?.trim();
    const iso = rawD ? normalizePublishedToIso(rawD) : null;
    if (title && link.startsWith("http")) out.push({ title, link, isoDate: iso });
  }
  return out.slice(0, MAX_ITEMS_PER_FEED);
}

export async function fetchSingleFeed(feedUrl: string): Promise<BrowseHit[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "user-agent": "ReadingPlanBrowse/1.0", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    if (!/<rss|<feed\b/i.test(xml.slice(0, 3000))) return [];
    const items = parseFeedXml(xml);
    return items.map((it) => {
      const publishedTime = it.isoDate;
      const excerpt = "";
      const hit: BrowseHit = {
        url: it.link,
        title: it.title.slice(0, 300),
        description: excerpt,
        summary: excerpt,
        excerpt,
        publishedTime,
        author: null,
        estimatedMinutes: 5,
        mediaType: detectMediaKindFromUrl(it.link),
      };
      return hit;
    });
  } catch {
    return [];
  }
}

/** 按种子列表拉取 RSS（并行探测 feed URL，成功则解析；博主主页种子跳过） */
export async function fetchBrowseRssHits(seeds: string[]): Promise<BrowseHit[]> {
  const cleaned = [...new Set(seeds.map((s) => s.trim()).filter(Boolean).filter((s) => !isBrowseProfileSeedUrl(s)))];
  if (!cleaned.length) return [];

  const perSeed = async (seed: string): Promise<BrowseHit[]> => {
    const candidates = candidateFeedUrls(seed);
    for (const url of candidates) {
      const hits = await fetchSingleFeed(url);
      if (hits.length) return hits;
    }
    return [];
  };

  const batches = await Promise.all(cleaned.map((s) => perSeed(s)));
  const byUrl = new Map<string, BrowseHit>();
  for (const batch of batches) {
    for (const h of batch) {
      const u = h.url.trim();
      if (!byUrl.has(u)) byUrl.set(u, h);
    }
  }
  return [...byUrl.values()];
}
