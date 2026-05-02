import { BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS } from "@/lib/browse-defaults";
import type { BrowseTopic } from "@/lib/types";

export function effectiveMaxPublishedAgeDays(topic: Pick<BrowseTopic, "maxPublishedAgeDays"> | null | undefined): number {
  const v = topic?.maxPublishedAgeDays;
  if (v != null && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n >= 1 && n <= 3650) return n;
  }
  return BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS;
}

/** A：隐藏「原文发布时间」早于 cutoff 的条目；无发布时间的条目保留（多为 RSS 新鲜条目） */
export function filterBrowseHitsByPublishedAge<T extends { publishedTime?: string | null }>(
  hits: T[],
  maxAgeDays: number,
): T[] {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  return hits.filter((h) => {
    if (!h.publishedTime?.trim()) return true;
    const t = Date.parse(h.publishedTime);
    if (Number.isNaN(t)) return true;
    return t >= cutoff;
  });
}
