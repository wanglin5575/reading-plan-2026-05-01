import { NextResponse } from "next/server";
import { getRouteHandlerUser, getRouteHandlerUserId } from "@/lib/auth/api";
import { upsertUserRegistry } from "@/lib/db";
import { browseTopicToQuery, fetchBrowseHits, BROWSE_TBS_MAX_DAYS_BOOTSTRAP, BROWSE_TBS_MAX_DAYS_INCREMENTAL } from "@/lib/browse-search";
import { filterBrowseHitsByPublishedAge, effectiveMaxPublishedAgeDays } from "@/lib/browse-recency";
import { fetchBrowseRssHits } from "@/lib/browse-rss";
import type { BrowseHit } from "@/lib/types";
import { getBrowseTopic } from "@/lib/db";
import { enrichBrowseHitsWithAi, stripBrowseHitServerFields } from "@/lib/browse-ai-enrich";
import { translateBrowseHitsToChinese } from "@/lib/translate-zh";
import { countChars, countWords, detectLanguage, estimateMinutes } from "@/lib/classify";
import { BROWSE_EXCLUDE_URLS_MAX } from "@/lib/browse-storage";

function mergeHitsPreferFirst(a: BrowseHit[], b: BrowseHit[]): BrowseHit[] {
  const seen = new Set<string>();
  const out: BrowseHit[] = [];
  for (const list of [a, b]) {
    for (const h of list) {
      const u = h.url.trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(h);
    }
  }
  return out;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  const uid = await getRouteHandlerUserId();
  if (session) {
    await upsertUserRegistry({
      userId: session.id,
      email: session.email,
      registeredAtIso: session.createdAt,
    });
  }
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
    const rssHits =
      topic.seedSources?.length && topic.seedSources.some((s) => s.trim())
        ? await fetchBrowseRssHits(topic.seedSources ?? [])
        : [];
    let searchHits: BrowseHit[] = [];
    try {
      searchHits = await fetchBrowseHits(topic, {
        since,
        until,
        tbsMaxSpanDays: bootstrap ? BROWSE_TBS_MAX_DAYS_BOOTSTRAP : BROWSE_TBS_MAX_DAYS_INCREMENTAL,
      });
    } catch (se: unknown) {
      const m = se instanceof Error ? se.message : "";
      if (m === "missing_firecrawl" && rssHits.length) {
        searchHits = [];
      } else {
        throw se;
      }
    }
    const combined = mergeHitsPreferFirst(rssHits, searchHits);
    const afterExclude = excludeSet.size ? combined.filter((h) => !excludeSet.has(h.url.trim())) : combined;
    const skippedKnown = combined.length - afterExclude.length;
    const maxAge = effectiveMaxPublishedAgeDays(topic);
    const recencyFiltered = filterBrowseHitsByPublishedAge(afterExclude, maxAge);
    const aiResult = await enrichBrowseHitsWithAi(recencyFiltered, uid ?? null);
    const translated = await translateBrowseHitsToChinese(aiResult.hits, uid ?? null);
    const hits = translated.map((h) => {
      const cleaned = stripBrowseHitServerFields(h);
      const blob = `${cleaned.summary}\n${cleaned.excerpt}\n${cleaned.description}`;
      const estFromContent = estimateMinutes(countChars(blob), countWords(blob), detectLanguage(blob));
      return {
        ...cleaned,
        estimatedMinutes:
          typeof cleaned.estimatedMinutes === "number" && cleaned.estimatedMinutes > 0
            ? cleaned.estimatedMinutes
            : estFromContent,
      };
    });
    const fetchedAt = until.toISOString();
    return NextResponse.json({
      query,
      hits,
      aiRejected: aiResult.rejected,
      fetchedAt,
      since: since.toISOString(),
      bootstrap,
      skippedKnown,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    if (msg === "missing_firecrawl") {
      return NextResponse.json({ error: "请配置 FIRECRAWL_API_KEY 后使用随览联网检索。" }, { status: 503 });
    }
    return NextResponse.json({ error: msg === "fetch_failed" ? "检索失败，请稍后重试。" : msg }, { status: 502 });
  }
}
