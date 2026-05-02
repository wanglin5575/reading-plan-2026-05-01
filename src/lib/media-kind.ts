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
  opts?: { bodySample?: string; durationSeconds?: number | null },
): MediaKind {
  const t = (ogType || "").toLowerCase();
  if (t.includes("video")) return "video";
  if (t.includes("music.song") || t.includes("audio") || t.includes("podcast")) return "audio";
  const fromUrl = detectMediaKindFromUrl(url);
  if (fromUrl !== "article") return fromUrl;

  const body = (opts?.bodySample || "").slice(0, 8000);
  const hay = `${title || ""}\n${body}`;
  if (/播客|Podcast|\bEP\d+\b|小宇宙|喜马拉雅|有声书/.test(hay)) return "audio";
  if (/\[视频\]|｜视频|VIDEO|Watch:|纪录片|公开课|演讲实录/i.test(hay)) return "video";
  // 正文里常见嵌入：即便 og:type 仍是 article，也标成视频
  if (
    /(youtube\.com\/embed|youtube-nocookie\.com\/embed|player\.bilibili\.com|bilibili\.com\/video|v\.qq\.com|youku\.com\/embed|video\.weixin\.qq\.com)/i.test(
      hay,
    )
  ) {
    return "video";
  }

  const d = opts?.durationSeconds;
  if (d != null && d >= 30) {
    if (/播客|音频|Podcast|小宇宙|喜马拉雅|SoundCloud|Spotify/i.test(hay)) return "audio";
    // 明显是图文长文时保留「文章」，避免把带阅读时长/schema 的稿件误判成视频
    if (/阅读|字|章节|pdf|下载文档|长篇|专栏|作者：|撰文/i.test(hay)) return "article";
    return "video";
  }

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
