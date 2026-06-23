import { buildArticleSequenceMap } from "@/lib/article-sequence";
import { listArticlesForUser } from "@/lib/db";
import type { Article } from "@/lib/types";
import { normalizeArticleUrlKey } from "@/lib/url-key";

export type ExistingArticleMatch = {
  article: Article;
  sequenceNumber: number;
};

export async function findExistingArticleByUrl(
  userId: string | null,
  url: string,
): Promise<ExistingArticleMatch | null> {
  const key = normalizeArticleUrlKey(url);
  if (!key) return null;
  const articles = await listArticlesForUser(userId);
  const sequenceMap = buildArticleSequenceMap(articles);
  const hit = articles.find((article) => normalizeArticleUrlKey(article.url) === key);
  if (!hit) return null;
  return {
    article: hit,
    sequenceNumber: sequenceMap.get(hit.id) ?? 0,
  };
}

export function duplicateArticleMessage(match: ExistingArticleMatch): string {
  const seq = match.sequenceNumber > 0 ? `，序号 #${match.sequenceNumber}` : "";
  return `该链接已添加过${seq}。`;
}
