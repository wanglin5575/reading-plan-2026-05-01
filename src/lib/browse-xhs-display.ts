import type { BrowseTopic } from "@/lib/types";
import type { BrowseStoredHit } from "@/lib/browse-storage";

export function isBrowseXhsTopic(topic: BrowseTopic | undefined | null): boolean {
  return topic?.kind === "xhs";
}

function isXhsHostUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.replace(/^www\./, "").toLowerCase();
    return /(^|\.)xhslink\.com$/.test(h) || /(^|\.)xiaohongshu\.com$/.test(h);
  } catch {
    return false;
  }
}

/** 从标题中提取序号（第 N 期、#N、（N）等）；无序号则返回较大值以便排在后面 */
export function extractXhsTitleSequence(title: string): number {
  const t = title.trim();
  if (!t) return Number.MAX_SAFE_INTEGER;
  const patterns = [
    /第\s*(\d+)\s*[期集话部]/,
    /[#＃]\s*(\d+)\b/,
    /[（(]\s*(\d+)\s*[）)]/,
    /^(\d+)\s*[.、．]\s*/,
    /^(\d+)\s*[-–—]\s*/,
    /\b(?:ep|episode|part)\s*(\d+)\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/** 小红书订阅：标题内序号升序，同序号按标题字典序 */
export function sortXhsBrowseHitsByTitleSeq<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = extractXhsTitleSequence(a.title);
    const sb = extractXhsTitleSequence(b.title);
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title, "zh-CN", { numeric: true, sensitivity: "base" });
  });
}

export type XhsBrowseGroup = {
  key: string;
  label: string;
  items: BrowseStoredHit[];
};

function profileUserIdFromSeed(seed: string): string | null {
  try {
    const m = new URL(seed.trim()).pathname.match(/\/user\/profile\/([0-9a-f]+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function hitGroupKey(hit: BrowseStoredHit): string {
  if (hit.xhsProfileSeed?.trim()) return hit.xhsProfileSeed.trim();
  if (hit.xhsBloggerName?.trim()) return `name:${hit.xhsBloggerName.trim()}`;
  if (hit.author?.trim()) return `author:${hit.author.trim()}`;
  return "__other__";
}

function hitGroupLabel(hit: BrowseStoredHit): string {
  return hit.xhsBloggerName?.trim() || hit.author?.trim() || "未命名博主";
}

/** 按订阅博主分组；组内按标题序号正序 */
export function groupBrowseHitsForXhsTopic(
  hits: BrowseStoredHit[],
  topic: BrowseTopic,
): XhsBrowseGroup[] {
  const seeds = (topic.seedSources ?? []).filter((s) => s.trim());
  const seedOrder = new Map<string, number>();
  seeds.forEach((s, i) => {
    seedOrder.set(s.trim(), i);
    const uid = profileUserIdFromSeed(s);
    if (uid) seedOrder.set(`uid:${uid}`, i);
  });

  const buckets = new Map<string, { label: string; items: BrowseStoredHit[] }>();
  for (const h of hits) {
    const key = hitGroupKey(h);
    const label = hitGroupLabel(h);
    const ex = buckets.get(key);
    if (ex) ex.items.push(h);
    else buckets.set(key, { label, items: [h] });
  }

  const groups: XhsBrowseGroup[] = [...buckets.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    items: sortXhsBrowseHitsByTitleSeq(v.items),
  }));

  groups.sort((a, b) => {
    const rank = (g: XhsBrowseGroup) => {
      const uid = profileUserIdFromSeed(g.key);
      if (uid && seedOrder.has(`uid:${uid}`)) return seedOrder.get(`uid:${uid}`)!;
      if (seedOrder.has(g.key)) return seedOrder.get(g.key)!;
      return 9999;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label, "zh-CN");
  });

  return groups;
}

export function isLikelyXhsProfileSeedLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (!/^https?:\/\//i.test(s)) return false;
  if (isXhsHostUrl(s)) return true;
  return /xhslink\.com/i.test(s);
}

export function parseXhsProfileSeedLines(text: string): string[] {
  return [...new Set(text.split("\n").map((s) => s.trim()).filter(Boolean))];
}
