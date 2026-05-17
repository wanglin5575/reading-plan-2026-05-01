import FirecrawlApp from "@mendable/firecrawl-js";
import type { ScrapeOptions } from "@mendable/firecrawl-js";
import type { MediaKind } from "@/lib/media-kind";
import { resolveBrowsePublishedTime } from "@/lib/browse-published";
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
  /** 从 meta/HTML 解析的发布时间（ISO），供 AI 参考与规则降级 */
  publishedIsoHint: string | null;
  /** Firecrawl 首屏截图，供多模态摘要（需配置 AI_SUMMARY_VISION_MODEL） */
  screenshotDataUrl?: string;
  rawMarkdown?: string;
  metadata?: Record<string, unknown>;
}

interface FirecrawlScrapeData {
  markdown?: string;
  metadata?: Record<string, unknown>;
  screenshot?: string;
  actions?: { screenshots?: string[] };
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

/** 视频/图集类页面：延长等待并尝试截首屏，便于字幕加载与多模态摘要 */
export function isLikelyRichMediaPageUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return /youtube\.com$|youtu\.be$|bilibili\.com|xiaohongshu\.com|xhslink\.com|instagram\.com|pinterest\.(com|co\.uk)$|tiktok\.com$|vimeo\.com$|ixigua\.com|douyin\.com$/.test(
      h,
    );
  } catch {
    return false;
  }
}

function pickScreenshotFromFirecrawlData(data: FirecrawlScrapeData | undefined): string | undefined {
  if (!data) return undefined;
  const top = typeof data.screenshot === "string" && data.screenshot.startsWith("data:image") ? data.screenshot : "";
  if (top) return top;
  const fromActions = data.actions?.screenshots?.find((s) => typeof s === "string" && s.startsWith("data:image"));
  return fromActions || undefined;
}

function extractLikelyTranscriptLines(rawMd: string): string {
  const lines = rawMd.split(/\n/);
  const out: string[] = [];
  const timeRe = /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?::\d{2})?\b/;
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 2 || t.length > 600) continue;
    if (timeRe.test(t)) out.push(t);
    else if (/字幕|Transcript|Caption|自动字幕|關閉字幕/i.test(t) && t.length < 120) out.push(t);
    if (out.length >= 48) break;
  }
  return out.join("\n").slice(0, 8000);
}

function buildRichMediaBodyNotes(url: string, stripped: string, rawMd: string, hadScreenshot: boolean): string {
  const transcript = extractLikelyTranscriptLines(rawMd);
  const head = isLikelyRichMediaPageUrl(url)
    ? `【多媒体页面】已延长页面等待并尝试抓取首屏画面${hadScreenshot ? "（已截取）" : "（截图未返回则仅文本）"}；摘要时请结合标题、描述与下方字幕/时间轴文案（若有）。\n\n`
    : "";
  const tail =
    transcript.trim().length > 0
      ? `\n\n【页面中与音视频相关的文字摘录】\n${transcript}`
      : "";
  return `${head}${stripped}${tail}`.trim();
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<ScrapeResult> {
  const client = new FirecrawlApp({ apiKey });
  const rich = isLikelyRichMediaPageUrl(url);
  const scrapeOpts: ScrapeOptions = rich
    ? {
        formats: ["markdown", "screenshot"],
        onlyMainContent: false,
        waitFor: 12000,
        actions: [
          { type: "wait", milliseconds: 8000 },
          { type: "screenshot", quality: 72, fullPage: false },
        ],
      }
    : { formats: ["markdown"] };

  const raw = (await client.scrape(url, scrapeOpts)) as unknown as FirecrawlScrapeResponse;
  const data = raw.data ?? raw;
  const markdown = data?.markdown ?? raw.markdown ?? "";
  const meta = (data?.metadata ?? raw.metadata ?? {}) as Record<string, unknown>;
  const screenshotDataUrl = pickScreenshotFromFirecrawlData(data as FirecrawlScrapeData);
  const title = metaString(meta, "title", "ogTitle", "og:title") || "";
  const ogType = metaString(meta, "og:type", "ogType");
  const primaryAuthor = metaString(meta, "author", "Author", "articleAuthor", "article:author");
  const strippedBase = stripMarkdown(markdown);
  const stripped = rich ? buildRichMediaBodyNotes(url, strippedBase, markdown, Boolean(screenshotDataUrl)) : strippedBase;
  const author = resolveArticleAuthor(primaryAuthor, meta, "", title, stripped, url);
  const durationSec = extractDurationSecondsFromMetadataDeep(meta);
  const mediaKind = detectMediaKindFromSignals(url, ogType, title, {
    bodySample: stripped,
    durationSeconds: durationSec,
  });
  const jsonRaw = (data as { json?: unknown }).json;
  const publishedIsoHint = resolveBrowsePublishedTime({
    meta,
    markdown,
    json: jsonRaw,
  });
  return {
    title,
    author,
    body: stripped,
    source: "firecrawl",
    ogType,
    mediaKind,
    durationSeconds: durationSec,
    publishedIsoHint,
    screenshotDataUrl,
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
  const publishedIsoHint = resolveBrowsePublishedTime({ rawHtml: html });
  return {
    title,
    author,
    body: stripped,
    source: "fallback",
    ogType,
    mediaKind,
    durationSeconds: durationSec,
    publishedIsoHint,
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
