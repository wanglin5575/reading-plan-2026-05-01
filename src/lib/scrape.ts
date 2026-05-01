import FirecrawlApp from "@mendable/firecrawl-js";

export interface ScrapeResult {
  title: string;
  body: string;
  source: "firecrawl" | "fallback";
}

interface FirecrawlScrapeData {
  markdown?: string;
  metadata?: {
    title?: string;
    ogTitle?: string;
  };
}

interface FirecrawlScrapeResponse {
  data?: FirecrawlScrapeData;
  markdown?: string;
  metadata?: {
    title?: string;
    ogTitle?: string;
  };
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

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<ScrapeResult> {
  const client = new FirecrawlApp({ apiKey });
  const raw = (await client.scrape(url, { formats: ["markdown"] })) as unknown as FirecrawlScrapeResponse;
  const data = raw.data ?? raw;
  const markdown = data?.markdown ?? "";
  const title = data?.metadata?.title || data?.metadata?.ogTitle || "";
  return {
    title,
    body: stripMarkdown(markdown),
    source: "firecrawl",
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
  const body = extractBodyText(html);
  return {
    title,
    body,
    source: "fallback",
  };
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
