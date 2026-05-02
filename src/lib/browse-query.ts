import type { BrowseTopic } from "@/lib/types";

function hostnameOrDomainFromSeed(seed: string): string | null {
  const s = seed.trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return u.hostname.replace(/^www\./, "") || null;
    }
  } catch {
    return null;
  }
  const plain = s.replace(/^www\./, "").replace(/\/$/, "");
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(plain)) return plain.toLowerCase();
  return null;
}

/** 生成随览联网检索查询串：主题 + (kw1 OR kw2 OR …)；若有种子站则追加 (site:a OR site:b …) */
export function browseTopicToQuery(topic: Pick<BrowseTopic, "name" | "keywords" | "seedSources">): string {
  const kws = topic.keywords.map((k) => k.trim()).filter(Boolean);
  const escaped = kws.map((k) => {
    if (/[\s"&|()]/.test(k)) return `"${k.replace(/"/g, '\\"')}"`;
    return k;
  });
  const core = `${topic.name} (${escaped.join(" OR ")})`;
  const hosts = [...new Set((topic.seedSources ?? []).map(hostnameOrDomainFromSeed).filter((x): x is string => Boolean(x)))];
  if (!hosts.length) return core;
  const sites = hosts.map((h) => `site:${h}`).join(" OR ");
  return `(${core}) (${sites})`;
}
