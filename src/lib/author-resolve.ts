/**
 * 统一作者兜底：深层 meta、正文 byline、站点名、域名。
 */

function decodeEnt(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const WEAK_AUTHOR = /^(未知作者|unknown|anonymous|admin|editor|staff|译者|原创)$/i;

function walkMetaForAuthor(obj: unknown, depth = 0): string[] {
  if (depth > 8 || obj == null) return [];
  const out: string[] = [];
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const kl = k.toLowerCase();
      if (/duration|image|logo|icon|url|width|height|charset/.test(kl)) continue;
      if (typeof v === "string" && v.trim()) {
        if (
          /author|creator|byline|writer|publishername|site_name|sitename|ogsitename/.test(kl) &&
          v.length < 120 &&
          !/^https?:\/\//i.test(v)
        ) {
          out.push(v.trim());
        }
      } else if (v && typeof v === "object") {
        if (kl.includes("author") && typeof (v as { name?: string }).name === "string") {
          const n = (v as { name: string }).name.trim();
          if (n) out.push(n);
        }
        out.push(...walkMetaForAuthor(v, depth + 1));
      }
    }
  }
  if (Array.isArray(obj)) {
    for (const x of obj) out.push(...walkMetaForAuthor(x, depth + 1));
  }
  return out;
}

function extractAuthorFromHtmlChunk(html: string): string {
  if (!html || html.length < 20) return "";
  const h = html.length > 120_000 ? html.slice(0, 120_000) : html;

  const meta =
    h.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    h.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    h.match(/<meta[^>]+property=["']og:author["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (meta) return decodeEnt(meta.trim());

  const ld = h.match(/"author"\s*:\s*\{\s*"@type"\s*:\s*"Person"\s*,\s*"name"\s*:\s*"([^"]+)"/i);
  if (ld?.[1]) return decodeEnt(ld[1].trim());

  const rel = h.match(/rel=["']author["'][^>]*>([^<]+)<\/a>/i);
  if (rel?.[1]) return decodeEnt(rel[1].trim());

  return "";
}

function inferFromTextSnippet(title: string, body: string): string {
  const text = `${title}\n${body.slice(0, 6000)}`;

  const byLine = /(?:^|[\n\r])\s*By\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s*[\n\r,]/m.exec(text);
  if (byLine?.[1]) return byLine[1].trim();

  const zhPerson =
    /(?:作者|撰文|编辑)[:：]\s*([\u4e00-\u9fffA-Za-z·．\s]{2,24})/.exec(text) ||
    /([\u4e00-\u9fff]{2,8})\s*(?:指出|表示|认为|写道)/.exec(text);
  if (zhPerson?.[1]) return zhPerson[1].trim().replace(/\s+/g, "");

  const zhOrg = /(?:据|来自)\s*《?([\u4e00-\u9fffA-Za-z·\-\s]{2,20})》?\s*(?:报道|消息)/.exec(text);
  if (zhOrg?.[1]) return zhOrg[1].trim();

  const titlePipe = /^([^|｜]{2,20})[|｜]/.exec(title.trim());
  if (titlePipe?.[1] && !/^http/i.test(titlePipe[1])) return titlePipe[1].trim();

  return "";
}

export function prettySiteNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length >= 2) {
      const base = parts[parts.length - 2];
      if (base && base.length > 1) return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return host || "";
  } catch {
    return "";
  }
}

/** 合并 Firecrawl / fallback 作者与页面片段 */
export function resolveArticleAuthor(
  primary: string | undefined,
  metadata: Record<string, unknown> | undefined,
  htmlOrEmpty: string,
  title: string,
  body: string,
  url: string,
): string {
  const raw = (primary || "").trim();
  if (raw && !WEAK_AUTHOR.test(raw)) return raw.slice(0, 80);

  if (metadata && typeof metadata === "object") {
    for (const c of walkMetaForAuthor(metadata, 0)) {
      if (c && !WEAK_AUTHOR.test(c) && c.length < 120) return c.slice(0, 80);
    }
  }

  const fromHtml = extractAuthorFromHtmlChunk(htmlOrEmpty);
  if (fromHtml && !WEAK_AUTHOR.test(fromHtml)) return fromHtml.slice(0, 80);

  const fromSnippet = inferFromTextSnippet(title, body);
  if (fromSnippet && !WEAK_AUTHOR.test(fromSnippet)) return fromSnippet.slice(0, 80);

  const site = metadata
    ? String(
        (metadata as { ogSiteName?: string; "og:site_name"?: string; site_name?: string }).ogSiteName ||
          (metadata as { "og:site_name"?: string })["og:site_name"] ||
          (metadata as { site_name?: string }).site_name ||
          "",
      ).trim()
    : "";
  if (site && site.length < 40 && !WEAK_AUTHOR.test(site)) return site;

  const pretty = prettySiteNameFromUrl(url);
  if (pretty) return pretty;

  return "未知作者";
}
