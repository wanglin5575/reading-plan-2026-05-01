import { NextResponse } from "next/server";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { browseTopicToQuery, fetchBrowseHits, BROWSE_TBS_MAX_DAYS_BOOTSTRAP, BROWSE_TBS_MAX_DAYS_INCREMENTAL } from "@/lib/browse-search";
import { getBrowseTopic } from "@/lib/db";
import { translateBrowseHitsToChinese } from "@/lib/translate-zh";
import { countChars, countWords, detectLanguage, estimateMinutes } from "@/lib/classify";
import { BROWSE_EXCLUDE_URLS_MAX } from "@/lib/browse-storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await getRouteHandlerUserId();
  const body = (await req.json().catch(() => ({}))) as {
    topicId?: unknown;
    since?: unknown;
    bootstrap?: unknown;
    excludeUrls?: unknown;
  };
  const topicId = typeof body.topicId === "string" ? body.topicId : "";
  if (!topicId) return NextResponse.json({ error: "缺少 topicId" }, { status: 400 });

  const topic = await getBrowseTopic(topicId, uid);
  if (!topic) return NextResponse.json({ error: "主题不存在" }, { status: 404 });

  const until = new Date();
  const bootstrap = body.bootstrap === true;

  let since: Date;
  if (typeof body.since === "string" && body.since.trim()) {
    const parsed = new Date(body.since);
    since = Number.isNaN(parsed.getTime()) ? new Date(until.getTime() - 24 * 60 * 60 * 1000) : parsed;
  } else {
    since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
  }
  if (since.getTime() > until.getTime()) {
    since = new Date(until.getTime() - 60 * 1000);
  }

  const excludeRaw = Array.isArray(body.excludeUrls) ? body.excludeUrls : [];
  const excludeSet = new Set<string>(
    excludeRaw
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, BROWSE_EXCLUDE_URLS_MAX),
  );

  try {
    const query = browseTopicToQuery(topic);
    const rawHits = await fetchBrowseHits(topic, {
      since,
      until,
      tbsMaxSpanDays: bootstrap ? BROWSE_TBS_MAX_DAYS_BOOTSTRAP : BROWSE_TBS_MAX_DAYS_INCREMENTAL,
    });
    const novelHits = excludeSet.size ? rawHits.filter((h) => !excludeSet.has(h.url.trim())) : rawHits;
    const translated = await translateBrowseHitsToChinese(novelHits);
    const hits = translated.map((h) => {
      const blob = `${h.summary}\n${h.excerpt}\n${h.description}`;
      return {
        ...h,
        estimatedMinutes: estimateMinutes(countChars(blob), countWords(blob), detectLanguage(blob)),
      };
    });
    const fetchedAt = until.toISOString();
    return NextResponse.json({
      query,
      hits,
      fetchedAt,
      since: since.toISOString(),
      bootstrap,
      skippedKnown: rawHits.length - novelHits.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    if (msg === "missing_firecrawl") {
      return NextResponse.json({ error: "请配置 FIRECRAWL_API_KEY 后使用随览联网检索。" }, { status: 503 });
    }
    return NextResponse.json({ error: msg === "fetch_failed" ? "检索失败，请稍后重试。" : msg }, { status: 502 });
  }
}
