import type { DocumentMetadata } from "@mendable/firecrawl-js";

const SKIP_META_KEY = /credits|cache|scrape|statuscode|concurrency|error|favicon|proxyused|timezone|contenttype|numpages|integration|sourceurl$/i;

/** 将各类日期字符串规范为 ISO；无法解析或明显无效的返回 null */
export function normalizePublishedToIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^(now|invalid|unknown)$/i.test(s)) return null;
  if (/\b(ago|yesterday|today|小时前|天前|周前|分钟前|秒前)\b/i.test(s)) return null;

  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  /** 「发布时间」不应远晚于当前（多为误取定时/结构化噪声）；保留 ~36h 容忍时区与定时稿 */
  if (t > now + 36 * 3600 * 1000) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (y < 1990 || y > new Date().getUTCFullYear() + 1) return null;
  return d.toISOString();
}

function scoreMetaKey(key: string): number {
  const kl = key.toLowerCase();
  if (kl.includes("article:published") || kl === "publishedtime" || kl.includes("datepublished")) return 100;
  if (kl.includes("published") || kl.includes("pub_date") || kl.includes("publication")) return 90;
  if ((kl.includes("date") || kl.includes("time")) && kl.includes("create")) return 70;
  if (kl.includes("dcdate") || kl.includes("dcterms") || kl.startsWith("dc")) return 65;
  if (kl.includes("date") && !kl.includes("modify") && !kl.includes("update") && !kl.includes("expir")) return 55;
  if (kl.includes("created")) return 50;
  if (kl.includes("issue") && kl.includes("date")) return 45;
  if (kl.includes("modify") || kl.includes("updated") || kl.includes("changed")) return 15;
  if (kl.includes("cached")) return 5;
  return 25;
}

/** 扫 metadata 全部字符串字段，按字段名权重择优（Firecrawl 常把日期放在非常规 key 里） */
export function extractPublishedFromMetadataDeep(meta: DocumentMetadata | undefined, depth = 0): string | null {
  if (!meta || depth > 5) return null;
  const m = meta as Record<string, unknown>;
  type Cand = { iso: string; score: number };
  const cands: Cand[] = [];

  for (const [key, val] of Object.entries(m)) {
    if (SKIP_META_KEY.test(key)) continue;
    const score = scoreMetaKey(key);
    if (typeof val === "string" && val.trim()) {
      const iso = normalizePublishedToIso(val);
      if (iso) cands.push({ iso, score });
    } else if (val != null && typeof val === "object" && !Array.isArray(val)) {
      const nested = extractPublishedFromMetadataDeep(val as DocumentMetadata, depth + 1);
      if (nested) cands.push({ iso: nested, score: Math.max(1, Math.floor(score * 0.75)) });
    }
  }

  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || Date.parse(b.iso) - Date.parse(a.iso));
  return cands[0]!.iso;
}

function extractFromHtmlChunk(html: string): string | null {
  if (!html || html.length < 10) return null;
  const h = html.length > 280_000 ? html.slice(0, 280_000) : html;

  const metaPatterns: { re: RegExp; score: number }[] = [
    { re: /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i, score: 100 },
    { re: /property=["']og:published_time["'][^>]*content=["']([^"']+)["']/i, score: 95 },
    { re: /name=["']pubdate["'][^>]*content=["']([^"']+)["']/i, score: 90 },
    { re: /name=["']publishdate["'][^>]*content=["']([^"']+)["']/i, score: 90 },
    { re: /name=["']date["'][^>]*content=["']([^"']+)["']/i, score: 55 },
    { re: /itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i, score: 98 },
    { re: /itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["']/i, score: 98 },
  ];

  type Cand = { iso: string; score: number };
  const cands: Cand[] = [];
  for (const { re, score } of metaPatterns) {
    const m = re.exec(h);
    if (m?.[1]) {
      const iso = normalizePublishedToIso(m[1]);
      if (iso) cands.push({ iso, score });
    }
  }

  const timeDt = /<time[^>]*datetime=["']([^"']+)["']/gi;
  let tm: RegExpExecArray | null;
  while ((tm = timeDt.exec(h)) !== null) {
    if (tm[1]) {
      const iso = normalizePublishedToIso(tm[1]);
      if (iso) cands.push({ iso, score: 85 });
    }
  }

  const jsonLdPublished =
    /"datePublished"\s*:\s*"([^"]+)"/i.exec(h) ||
    /"datepublished"\s*:\s*"([^"]+)"/i.exec(h) ||
    /'datePublished'\s*:\s*'([^']+)'/i.exec(h) ||
    /datePublished["\s]*:["\s]*([^"',}\s]+)/i.exec(h);
  if (jsonLdPublished?.[1]) {
    const iso = normalizePublishedToIso(jsonLdPublished[1]);
    if (iso) cands.push({ iso, score: 92 });
  }

  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || Date.parse(b.iso) - Date.parse(a.iso));
  return cands[0]!.iso;
}

export function extractPublishedFromMarkdown(markdown: string | undefined): string | null {
  if (!markdown?.trim()) return null;
  const md = markdown.length > 120_000 ? markdown.slice(0, 120_000) : markdown;
  return extractFromHtmlChunk(md);
}

export function extractPublishedFromSerpSnippet(description: string | undefined): string | null {
  if (!description?.trim()) return null;
  const d = description.trim();
  const isoYmd = /^(\d{4}-\d{2}-\d{2})\b/.exec(d);
  if (isoYmd?.[1]) {
    const iso = normalizePublishedToIso(isoYmd[1] + "T12:00:00.000Z");
    if (iso) return iso;
  }
  const us = /^([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s*[—\-–·]/.exec(d);
  if (us?.[1]) {
    const iso = normalizePublishedToIso(us[1]);
    if (iso) return iso;
  }
  const zh =
    /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(d) ||
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(d);
  if (zh) {
    const y = Number(zh[1]);
    const mo = Number(zh[2]);
    const da = Number(zh[3]);
    if (y >= 1990 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const iso = normalizePublishedToIso(`${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}T12:00:00.000Z`);
      if (iso) return iso;
    }
  }
  return null;
}

function walkJsonForDatePublished(node: unknown, depth = 0): string | null {
  if (depth > 12) return null;
  if (node == null) return null;
  if (typeof node === "string") return normalizePublishedToIso(node);
  if (Array.isArray(node)) {
    for (const x of node) {
      const f = walkJsonForDatePublished(x, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (/^datepublished$/i.test(k) || k === "@graph") {
        const v = o[k];
        if (k === "@graph" && Array.isArray(v)) {
          for (const item of v) {
            const inner = item && typeof item === "object" ? (item as Record<string, unknown>)["datePublished"] : null;
            const iso = typeof inner === "string" ? normalizePublishedToIso(inner) : walkJsonForDatePublished(item, depth + 1);
            if (iso) return iso;
          }
        } else if (typeof v === "string") {
          const iso = normalizePublishedToIso(v);
          if (iso) return iso;
        }
      }
    }
    for (const v of Object.values(o)) {
      const f = walkJsonForDatePublished(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

export function extractPublishedFromJsonLd(json: unknown): string | null {
  return walkJsonForDatePublished(json, 0);
}

export type BrowsePublishedSources = {
  meta?: DocumentMetadata;
  markdown?: string;
  rawHtml?: string;
  json?: unknown;
  serpDescription?: string;
  newsDate?: string | null;
};

/** 汇总多来源，择优一条 ISO 发布时间 */
export function resolveBrowsePublishedTime(src: BrowsePublishedSources): string | null {
  type Cand = { iso: string; score: number };
  const cands: Cand[] = [];

  const add = (iso: string | null | undefined, score: number) => {
    const n = iso ? normalizePublishedToIso(iso) : null;
    if (n) cands.push({ iso: n, score });
  };

  add(extractPublishedFromMetadataDeep(src.meta), 110);
  add(src.newsDate ? normalizePublishedToIso(src.newsDate) : null, 100);
  if (src.json !== undefined) add(extractPublishedFromJsonLd(src.json), 95);
  add(src.rawHtml ? extractFromHtmlChunk(src.rawHtml) : null, 88);
  add(src.markdown ? extractPublishedFromMarkdown(src.markdown) : null, 75);
  add(src.serpDescription ? extractPublishedFromSerpSnippet(src.serpDescription) : null, 35);

  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || Date.parse(b.iso) - Date.parse(a.iso));
  return cands[0]!.iso;
}

export function normalizeBrowseUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}
