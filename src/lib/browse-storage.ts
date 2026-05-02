import type { BrowseAiRejectedItem, BrowseHit } from "./types";

export const BROWSE_STORAGE_KEY = "reading-plan-browse-v2";

/** 随览条目最长保留：按「首次收录」firstSeenAt 起算，默认 90 天（客户端与服务端同一规则） */
export const BROWSE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** 主题从未成功刷新过时，首次拉取的起始时间窗（约 3 个月，联网优先近期文章） */
export const BROWSE_BOOTSTRAP_SINCE_MS = 90 * 24 * 60 * 60 * 1000;

/** 请求里排除已知 URL 的上限，避免 payload 过大 */
export const BROWSE_EXCLUDE_URLS_MAX = 800;

export const BROWSE_SORT_LS_KEY = "reading-plan-browse-sort-v1";

/** 各主题下本轮/近期被 AI 筛除的条目（仅本地） */
export const BROWSE_AI_REJECTED_LS_KEY = "reading-plan-browse-ai-rejected-v1";

/** 各主题下用户上次已查看的筛除列表快照（JSON.stringify 比对用） */
export const BROWSE_REJECTED_SEEN_LS_KEY = "reading-plan-browse-rejected-seen-v1";

export type BrowseSortMode = "refreshed" | "published";

export interface BrowseStoredHit extends BrowseHit {
  firstSeenAt: string;
  /** 本条最后一次出现在随览抓取结果中的时间（排序、与 90 天保留无冲突） */
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

/** 无 updatedAt 的旧数据在合并时补此值；展示时映射为「早期」 */
export const BROWSE_REJECTED_LEGACY_AT = "1970-01-01T00:00:00.000Z";

/**
 * 合并本次刷新返回的筛除列表：按 URL 去重，新数据覆盖同 URL；未再出现的旧记录保留。
 * 本次批次中的每条 `updatedAt` 置为 `fetchedAtIso`。
 */
export function mergeBrowseAiRejectedForTopic(
  existing: BrowseAiRejectedItem[],
  incoming: BrowseAiRejectedItem[],
  fetchedAtIso: string,
): BrowseAiRejectedItem[] {
  const map = new Map<string, BrowseAiRejectedItem>();
  for (const x of existing) {
    const u = x.url?.trim();
    if (!u) continue;
    map.set(u, {
      ...x,
      url: u,
      updatedAt: x.updatedAt ?? BROWSE_REJECTED_LEGACY_AT,
    });
  }
  for (const x of incoming) {
    const u = x.url?.trim();
    if (!u) continue;
    map.set(u, {
      ...x,
      url: u,
      updatedAt: fetchedAtIso,
    });
  }
  return Array.from(map.values()).sort(
    (a, b) => Date.parse(b.updatedAt ?? "0") - Date.parse(a.updatedAt ?? "0"),
  );
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

/** 单条列表：按「首次随览收录」起算，超过保留期的条目剔除（与是否再次出现在检索结果无关） */
export function pruneBrowseItems(items: BrowseStoredHit[], now = Date.now()): BrowseStoredHit[] {
  return items.filter((x) => {
    const t = Date.parse(x.firstSeenAt);
    if (Number.isNaN(t)) return false;
    return now - t < BROWSE_RETENTION_MS;
  });
}

/** 整份主题 feed 的 90 天裁剪（写入/读出数据库时与客户端合并逻辑共用） */
export function pruneBrowseTopicFeed(feed: BrowseTopicFeed, now = Date.now()): BrowseTopicFeed {
  return {
    lastRefreshAt: feed.lastRefreshAt,
    items: pruneBrowseItems(feed.items, now),
  };
}

function hitRecencyMs(h: BrowseStoredHit): number {
  const t = Date.parse(h.lastRefreshedAt || h.firstSeenAt);
  return Number.isNaN(t) ? 0 : t;
}

/** 同 URL 两条记录取较新一次出现在抓取结果中的版本；并列时取摘要更完整者 */
function pickRicherBrowseHit(a: BrowseStoredHit, b: BrowseStoredHit): BrowseStoredHit {
  const ra = hitRecencyMs(a);
  const rb = hitRecencyMs(b);
  if (rb > ra) return b;
  if (ra > rb) return a;
  const score = (h: BrowseStoredHit) =>
    (h.summary?.length ?? 0) + (h.excerpt?.length ?? 0) + (h.description?.length ?? 0);
  return score(b) >= score(a) ? b : a;
}

/**
 * 合并本机与服务器上的随览缓存（按 URL 去重），用于多端同步。
 * 保留时间窗淘汰规则，lastRefreshAt 取二者较晚者。
 */
export function mergeBrowseTopicFeeds(local: BrowseTopicFeed, remote: BrowseTopicFeed): BrowseTopicFeed {
  const byUrl = new Map<string, BrowseStoredHit>();
  for (const x of local.items) byUrl.set(x.url, x);
  for (const x of remote.items) {
    const ex = byUrl.get(x.url);
    byUrl.set(x.url, ex ? pickRicherBrowseHit(ex, x) : x);
  }
  const items = pruneBrowseItems(sortBrowseItemsByRefreshed([...byUrl.values()]));
  const lr = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
  const lm = lr(local.lastRefreshAt);
  const rm = lr(remote.lastRefreshAt);
  const lastMs = Math.max(
    Number.isNaN(lm) ? 0 : lm,
    Number.isNaN(rm) ? 0 : rm,
  );
  return { lastRefreshAt: lastMs > 0 ? new Date(lastMs).toISOString() : null, items };
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
        mediaType: h.mediaType ?? ex.mediaType,
        titleZh: h.titleZh ?? ex.titleZh,
        summarySource: h.summarySource ?? ex.summarySource,
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

export function loadBrowseAiRejectedMap(): Record<string, BrowseAiRejectedItem[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BROWSE_AI_REJECTED_LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    return p as Record<string, BrowseAiRejectedItem[]>;
  } catch {
    return {};
  }
}

export function saveBrowseAiRejectedMap(map: Record<string, BrowseAiRejectedItem[]>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BROWSE_AI_REJECTED_LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function loadRejectedSeenMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BROWSE_REJECTED_SEEN_LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    return p as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveRejectedSeenMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BROWSE_REJECTED_SEEN_LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
