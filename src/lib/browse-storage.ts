import type { BrowseHit } from "./types";

export const BROWSE_STORAGE_KEY = "reading-plan-browse-v2";

/** 本地保留随览条目的最长时间：按 lastRefreshedAt 滚动，默认 90 天 */
export const BROWSE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** 主题从未成功刷新过时，首次拉取的起始时间窗（约 6 个月） */
export const BROWSE_BOOTSTRAP_SINCE_MS = 180 * 24 * 60 * 60 * 1000;

/** 请求里排除已知 URL 的上限，避免 payload 过大 */
export const BROWSE_EXCLUDE_URLS_MAX = 800;

export const BROWSE_SORT_LS_KEY = "reading-plan-browse-sort-v1";

export type BrowseSortMode = "refreshed" | "published";

export interface BrowseStoredHit extends BrowseHit {
  firstSeenAt: string;
  /** 本条最后一次出现在随览抓取结果中的时间（排序、三个月淘汰） */
  lastRefreshedAt: string;
}

export interface BrowseTopicFeed {
  lastRefreshAt: string | null;
  items: BrowseStoredHit[];
}

export interface BrowseStorage {
  topics: Record<string, BrowseTopicFeed>;
}

function migrateHit(x: BrowseStoredHit): BrowseStoredHit {
  if (x.lastRefreshedAt) return x;
  return { ...x, lastRefreshedAt: x.firstSeenAt };
}

function migrateTopicFeed(feed: BrowseTopicFeed): BrowseTopicFeed {
  return {
    ...feed,
    items: feed.items.map((item) => migrateHit(item)),
  };
}

export function loadBrowseStorage(): BrowseStorage {
  if (typeof window === "undefined") return { topics: {} };
  try {
    const raw = localStorage.getItem(BROWSE_STORAGE_KEY);
    if (!raw) return { topics: {} };
    const p = JSON.parse(raw) as BrowseStorage;
    if (!p.topics || typeof p.topics !== "object") return { topics: {} };
    const topics: Record<string, BrowseTopicFeed> = {};
    for (const [id, feed] of Object.entries(p.topics)) {
      topics[id] = migrateTopicFeed(feed);
    }
    return { topics };
  } catch {
    return { topics: {} };
  }
}

export function saveBrowseStorage(s: BrowseStorage) {
  localStorage.setItem(BROWSE_STORAGE_KEY, JSON.stringify(s));
}

/** 按原文发布时间倒序；无发布时间的排在后面，再按刷新时间倒序 */
export function sortBrowseItemsByPublished(items: BrowseStoredHit[]): BrowseStoredHit[] {
  return [...items].sort((a, b) => {
    const pa = a.publishedTime ? Date.parse(a.publishedTime) : NaN;
    const pb = b.publishedTime ? Date.parse(b.publishedTime) : NaN;
    const va = !Number.isNaN(pa);
    const vb = !Number.isNaN(pb);
    if (va && vb && pb !== pa) return pb - pa;
    if (va && !vb) return -1;
    if (!va && vb) return 1;
    const ra = Date.parse(a.lastRefreshedAt || a.firstSeenAt);
    const rb = Date.parse(b.lastRefreshedAt || b.firstSeenAt);
    return (Number.isNaN(rb) ? 0 : rb) - (Number.isNaN(ra) ? 0 : ra);
  });
}

/** 按最后一次出现在抓取结果中的时间倒序 */
export function sortBrowseItemsByRefreshed(items: BrowseStoredHit[]): BrowseStoredHit[] {
  return [...items].sort((a, b) => {
    const ra = Date.parse(a.lastRefreshedAt || a.firstSeenAt);
    const rb = Date.parse(b.lastRefreshedAt || b.firstSeenAt);
    return (Number.isNaN(rb) ? 0 : rb) - (Number.isNaN(ra) ? 0 : ra);
  });
}

export function sortBrowseItemsForDisplay(items: BrowseStoredHit[], mode: BrowseSortMode): BrowseStoredHit[] {
  return mode === "published" ? sortBrowseItemsByPublished(items) : sortBrowseItemsByRefreshed(items);
}

/** 本地保留：按「首次随览收录」起算 90 天（与是否再次出现在检索结果无关） */
export function pruneBrowseItems(items: BrowseStoredHit[], now = Date.now()): BrowseStoredHit[] {
  return items.filter((x) => {
    const t = Date.parse(x.firstSeenAt);
    if (Number.isNaN(t)) return false;
    return now - t < BROWSE_RETENTION_MS;
  });
}

/**
 * 合并 Firecrawl 新结果：按 URL 去重。
 * 对「本次抓取」里已出现的链接更新 lastRefreshedAt；若发布时间早于本次 since 且该 URL 本就存在，可跳过更新（主要覆盖增量旧卡场景）。
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
        author: h.author ?? ex.author,
        estimatedMinutes: h.estimatedMinutes ?? ex.estimatedMinutes,
        firstSeenAt: ex.firstSeenAt,
        lastRefreshedAt: fetchedAt,
      });
    } else {
      byUrl.set(h.url, { ...h, firstSeenAt: fetchedAt, lastRefreshedAt: fetchedAt });
    }
  }

  let items = pruneBrowseItems(sortBrowseItemsByRefreshed([...byUrl.values()]));
  return { lastRefreshAt: fetchedAt, items };
}
