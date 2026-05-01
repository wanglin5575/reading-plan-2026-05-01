import type { BrowseHit } from "@/lib/types";

export const BROWSE_STORAGE_KEY = "reading-plan-browse-v2";
export const RETENTION_MS = 10 * 24 * 60 * 60 * 1000;

export interface BrowseStoredHit extends BrowseHit {
  firstSeenAt: string;
}

export interface BrowseTopicFeed {
  lastRefreshAt: string | null;
  items: BrowseStoredHit[];
}

export interface BrowseStorage {
  topics: Record<string, BrowseTopicFeed>;
}

export function loadBrowseStorage(): BrowseStorage {
  if (typeof window === "undefined") return { topics: {} };
  try {
    const raw = localStorage.getItem(BROWSE_STORAGE_KEY);
    if (!raw) return { topics: {} };
    const p = JSON.parse(raw) as BrowseStorage;
    if (!p.topics || typeof p.topics !== "object") return { topics: {} };
    return p;
  } catch {
    return { topics: {} };
  }
}

export function saveBrowseStorage(s: BrowseStorage) {
  localStorage.setItem(BROWSE_STORAGE_KEY, JSON.stringify(s));
}

export function sortTimeMs(h: BrowseStoredHit): number {
  const p = h.publishedTime ? Date.parse(h.publishedTime) : NaN;
  const f = Date.parse(h.firstSeenAt);
  if (!Number.isNaN(p)) return p;
  if (!Number.isNaN(f)) return f;
  return 0;
}

export function sortBrowseItems(items: BrowseStoredHit[]): BrowseStoredHit[] {
  return [...items].sort((a, b) => sortTimeMs(b) - sortTimeMs(a));
}

export function pruneBrowseItems(items: BrowseStoredHit[], now = Date.now()): BrowseStoredHit[] {
  return items.filter((x) => {
    const t = Date.parse(x.firstSeenAt);
    if (Number.isNaN(t)) return false;
    return now - t < RETENTION_MS;
  });
}

/**
 * 合并 Firecrawl 新结果：按 URL 去重；有明确发布时间且早于本次 since 的条目丢弃。
 */
export function mergeBrowseFeed(
  prev: BrowseTopicFeed,
  newHits: BrowseHit[],
  fetchedAt: string,
  sinceMs: number,
): BrowseTopicFeed {
  const byUrl = new Map<string, BrowseStoredHit>();
  for (const x of prev.items) byUrl.set(x.url, x);

  for (const h of newHits) {
    const existedBefore = prev.items.some((x) => x.url === h.url);
    /** 仅过滤「更新用」的旧元数据：新出现的链接不因 publishedTime 被误杀（很多站点元数据日期不准） */
    if (existedBefore && h.publishedTime) {
      const t = Date.parse(h.publishedTime);
      if (!Number.isNaN(t) && t < sinceMs) continue;
    }

    const ex = byUrl.get(h.url);
    if (ex) {
      byUrl.set(h.url, {
        ...ex,
        title: h.title || ex.title,
        description: h.description || ex.description,
        summary: h.summary || ex.summary,
        excerpt: h.excerpt || ex.excerpt,
        publishedTime: h.publishedTime ?? ex.publishedTime,
        firstSeenAt: ex.firstSeenAt,
      });
    } else {
      byUrl.set(h.url, { ...h, firstSeenAt: fetchedAt });
    }
  }

  let items = pruneBrowseItems(sortBrowseItems([...byUrl.values()]));
  return { lastRefreshAt: fetchedAt, items };
}
