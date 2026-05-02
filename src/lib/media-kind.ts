export type MediaKind = "article" | "video" | "audio";

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  article: "文章",
  video: "视频",
  audio: "音频",
};

/** 从 URL 路径判断（托管域） */
export function detectMediaKindFromUrl(url: string): MediaKind {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (
      /youtube\.com$|youtu\.be$|bilibili\.com|bilivideo\.|vimeo\.com$|youku\.com|ixigua\.com|ted\.com$/.test(h)
    ) {
      return "video";
    }
    if (
      /spotify\.com|podcasts\.apple\.com|xiaoyuzhoufm\.com|ximalaya\.com|soundcloud\.com|anchor\.fm|podcast|anchor\.fm/.test(
        h,
      )
    ) {
      return "audio";
    }
  } catch {
    /* ignore */
  }
  return "article";
}

export function detectMediaKindFromSignals(
  url: string,
  ogType: string | undefined,
  title: string | undefined,
): MediaKind {
  const t = (ogType || "").toLowerCase();
  if (t.includes("video")) return "video";
  if (t.includes("music.song") || t.includes("audio") || t.includes("podcast")) return "audio";
  const fromUrl = detectMediaKindFromUrl(url);
  if (fromUrl !== "article") return fromUrl;
  const hay = `${title || ""}`;
  if (/播客|Podcast|\bEP\d+\b|小宇宙|喜马拉雅/.test(hay)) return "audio";
  if (/\[视频\]|｜视频|VIDEO|Watch:/i.test(hay)) return "video";
  return "article";
}

/** ISO 8601 duration e.g. PT1H2M10S / PT5M / PT45S */
export function parseIso8601DurationSeconds(input: string | null | undefined): number | null {
  if (!input?.trim()) return null;
  const s = input.trim().toUpperCase();
  if (!/^PT/.test(s)) return null;
  let sec = 0;
  const h = /(\d+)H/.exec(s);
  const m = /(\d+)M/.exec(s);
  const r = /(\d+)S/.exec(s);
  if (h) sec += parseInt(h[1], 10) * 3600;
  if (m) sec += parseInt(m[1], 10) * 60;
  if (r) sec += parseInt(r[1], 10);
  if (!h && !m && !r) {
    const n = /^PT(\d+)$/.exec(s);
    if (n) sec = parseInt(n[1], 10);
  }
  if (sec < 15 || sec > 86400 * 6) return null;
  return sec;
}

/** 自 Firecrawl metadata 递归抓取 ISO8601 时长（常见于 VideoObject） */
export function extractDurationSecondsFromMetadataDeep(
  meta: Record<string, unknown> | undefined,
  depth = 0,
): number | null {
  if (!meta || depth > 14) return null;
  for (const [k, v] of Object.entries(meta)) {
    const kl = k.toLowerCase();
    if (/duration|videolength|length/i.test(kl) && typeof v === "string") {
      const sec = parseIso8601DurationSeconds(v);
      if (sec) return sec;
    }
    if (typeof v === "string" && /^P(T|\d)/i.test(v.trim())) {
      const sec = parseIso8601DurationSeconds(v.trim());
      if (sec) return sec;
    }
    if (v && typeof v === "object") {
      const nested = extractDurationSecondsFromMetadataDeep(v as Record<string, unknown>, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}
