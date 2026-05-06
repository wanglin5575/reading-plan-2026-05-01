import type { Article } from "@/lib/types";

/** 与 ArticleCard 中 read-preview 请求体一致：摘要 + 节选 */
export function buildArticlePreviewSource(article: Pick<Article, "summary" | "rawExcerpt">): string {
  const parts: string[] = [];
  const s = article.summary?.trim();
  if (s && s !== "(暂无摘要)") parts.push(s);
  const ex = article.rawExcerpt?.trim();
  if (ex) parts.push(ex);
  return parts.join("\n\n");
}
