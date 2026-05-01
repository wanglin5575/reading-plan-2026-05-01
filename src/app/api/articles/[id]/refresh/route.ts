import { NextResponse } from "next/server";
import { getArticle, updateArticle } from "@/lib/db";
import { scrapeUrl } from "@/lib/scrape";
import { buildArticleClassification } from "@/lib/classify";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const article = await getArticle(id);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const scraped = await scrapeUrl(article.url);
  const cls = buildArticleClassification(article.url, scraped.title, scraped.body);

  const updated = { ...article, ...cls };
  await updateArticle(updated);
  return NextResponse.json({ article: updated });
}
