import FirecrawlApp from "@mendable/firecrawl-js";
import type { MediaKind } from "@/lib/media-kind";
import { detectMediaKindFromSignals, extractDurationSecondsFromMetadataDeep, parseIso8601DurationSeconds } from "@/lib/media-kind";
import { resolveArticleAuthor } from "@/lib/author-resolve";

export interface ScrapeResult {
  title: string;
  author: string;
  body: string;
  source: "firecrawl" | "fallback";
  ogType?: string;
  mediaKind: MediaKind;
  durationSeconds: number | null;
  rawMarkdown?: string;
  metadata?: Record<string, unknown>;
}

interface FirecrawlScrapeData {
  markdown?: string;
  metadata?: Record<string, unknown>;
}

interface FirecrawlScrapeResponse {
  data?: FirecrawlScrapeData;
  markdown?: string;
  metadata?: Record<string, unknown>;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (apiKey) {
    try {
      return await scrapeWithFirecrawl(url, apiKey);
    } catch (err) {
      console.warn("[scrape] firecrawl failed, falling back:", err);
    }
  }
  return scrapeWithFallback(url);
}

function metaString(m: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!m) return undefined;
  for (const k of keys) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<ScrapeResult> {
  const client = new FirecrawlApp({ apiKey });
  const raw = (await client.scrape(url, { formats: ["markdown"] })) as unknown as FirecrawlScrapeResponse;
  const data = raw.data ?? raw;
  const markdown = data?.markdown ?? raw.markdown ?? "";
  const meta = (data?.metadata ?? raw.metadata ?? {}) as Record<string, unknown>;
  const title = metaString(meta, "title", "ogTitle", "og:title") || "";
  const ogType = metaString(meta, "og:type", "ogType");
  const primaryAuthor = metaString(meta, "author", "Author", "articleAuthor", "article:author");
  const stripped = stripMarkdown(markdown);
  const author = resolveArticleAuthor(primaryAuthor, meta, "", title, stripped, url);
  const durationSec = extractDurationSecondsFromMetadataDeep(meta);
  const mediaKind = detectMediaKindFromSignals(url, ogType, title, {
    bodySample: stripped,
    durationSeconds: durationSec,
  });
  return {
    title,
    author,
    body: stripped,
    source: "firecrawl",
    ogType,
    mediaKind,
    durationSeconds: durationSec,
    rawMarkdown: markdown.slice(0, 50_000),
    metadata: meta,
  };
}

async function scrapeWithFallback(url: string): Promise<ScrapeResult> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
  });
  const html = await res.text();
  const title = extractTitle(html);
  const stripped = extractBodyText(html);
  const ogType =
    html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)?.[1] || undefined;
  const primaryAuthor = extractAuthor(html);
  const author = resolveArticleAuthor(primaryAuthor, undefined, html, title, stripped, url);
  const durationSec =
    extractDurationSecondsFromHtml(html) ?? extractDurationFromJsonLdSnippet(html);
  const mediaKind = detectMediaKindFromSignals(url, ogType, title, {
    bodySample: stripped,
    durationSeconds: durationSec,
  });
  return {
    title,
    author,
    body: stripped,
    source: "fallback",
    ogType,
    mediaKind,
    durationSeconds: durationSec,
    rawMarkdown: undefined,
    metadata: undefined,
  };
}

function extractDurationFromJsonLdSnippet(html: string): number | null {
  const m = html.match(/"duration"\s*:\s*"([^"]+)"/i);
  if (m?.[1]) return parseIso8601DurationSeconds(m[1]);
  return null;
}

function extractDurationSecondsFromHtml(html: string): number | null {
  const itemProp = html.match(/itemprop=["']duration["'][^>]*content=["']([^"']+)["']/i);
  if (itemProp?.[1]) {
    const s = parseIso8601DurationSeconds(itemProp[1]);
    if (s) return s;
  }
  return null;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match) return decodeHtml(match[1].trim());
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  return og ? decodeHtml(og[1]) : "";
}

function extractBodyText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  return decodeHtml(stripped).trim();
}

function extractAuthor(html: string): string {
  const byMeta =
    html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (byMeta) return decodeHtml(byMeta.trim());
  return "";
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
