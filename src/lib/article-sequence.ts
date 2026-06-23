import type { Article } from "@/lib/types";

function addedTimeMs(article: Article): number {
  const t = new Date(article.addedAt).getTime();
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/**
 * 按文章加入书库时间生成稳定序号：最早加入为 1。
 * 同一时间戳时用 id 兜底，保证每次渲染顺序一致。
 */
export function buildArticleSequenceMap(articles: Article[]): Map<string, number> {
  const sorted = [...articles].sort((a, b) => {
    const byTime = addedTimeMs(a) - addedTimeMs(b);
    return byTime || a.id.localeCompare(b.id);
  });
  return new Map(sorted.map((article, index) => [article.id, index + 1]));
}
