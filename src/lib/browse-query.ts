import type { BrowseTopic } from "@/lib/types";

/** 生成随览联网检索查询串：主题 + (kw1 OR kw2 OR …)，搜索引擎下近似「主题且任一关键词」 */
export function browseTopicToQuery(topic: Pick<BrowseTopic, "name" | "keywords">): string {
  const kws = topic.keywords.map((k) => k.trim()).filter(Boolean);
  const escaped = kws.map((k) => {
    if (/[\s"&|()]/.test(k)) return `"${k.replace(/"/g, '\\"')}"`;
    return k;
  });
  return `${topic.name} (${escaped.join(" OR ")})`;
}
