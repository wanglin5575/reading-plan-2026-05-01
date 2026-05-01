import type { DocumentMetadata } from "@mendable/firecrawl-js";

const AUTHOR_META_KEYS = [
  "author",
  "Author",
  "ogAuthor",
  "articleAuthor",
  "twitter:creator",
];

export function pickAuthorFromMetadata(meta: DocumentMetadata | undefined): string | null {
  if (!meta) return null;
  const m = meta as Record<string, unknown>;
  for (const k of AUTHOR_META_KEYS) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** 展示用：原文网页发布时间 */
export function formatPublishedTimeZh(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(t));
}

/**
 * 无元数据作者时，从标题/摘要里猜「主要表态主体」（人名、机构片段或站点域名）。
 */
export function inferViewpointAttribution(title: string, summary: string, excerpt: string, url: string): string {
  const text = `${title}\n${summary}\n${excerpt}`;

  const byLine = /(?:^|[\n\r])\s*[Bb]y\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s*[\n\r]/.exec(text);
  if (byLine?.[1]) return byLine[1].trim();

  const enInArticle = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*在文中/.exec(text);
  if (enInArticle?.[1]) return enInArticle[1].trim();

  const said = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:said|writes|argued|argues|notes|believes)\b/.exec(
    text,
  );
  if (said?.[1]) return said[1].trim();

  const zhOrg = /(?:据|来自)\s*《?([\u4e00-\u9fffA-Za-z·\-\s]{2,24})》?\s*(?:报道|消息)/.exec(text);
  if (zhOrg?.[1]) return zhOrg[1].trim().slice(0, 32);

  const zhPerson =
    /([\u4e00-\u9fff]{2,8})\s*(?:指出|表示|认为|写道|称|强调)/.exec(text) ||
    /(?:作者[：:]\s*)([\u4e00-\u9fffA-Za-z·]{2,20})/.exec(text);
  if (zhPerson?.[1]) return zhPerson[1].trim();

  const titlePipe = /^([^|｜]{2,24})[|｜]/.exec(title.trim());
  if (titlePipe?.[1] && !/^http/i.test(titlePipe[1])) {
    const s = titlePipe[1].trim();
    if (s.length >= 2 && s.length <= 24) return s;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {
    /* ignore */
  }
  return "未标注";
}

export function resolveBrowseAuthorLine(
  metaAuthor: string | null | undefined,
  title: string,
  summary: string,
  excerpt: string,
  url: string,
): string {
  const a = metaAuthor?.trim();
  if (a && !/^(未知作者|unknown|anonymous)$/i.test(a)) return a;
  return inferViewpointAttribution(title, summary, excerpt, url);
}
