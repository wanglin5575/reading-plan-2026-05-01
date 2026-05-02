import { NextResponse } from "next/server";
import { getArticle, updateArticle } from "@/lib/db";
import { scrapeUrl } from "@/lib/scrape";
import { buildArticleClassification } from "@/lib/classify";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ownerId = await getRouteHandlerUserId();
  if (isAuthEnabled() && !ownerId) {
    return NextResponse.json({ error: "unauthorized", message: "请先登录。" }, { status: 401 });
  }
  const article = await getArticle(id, ownerId ?? null);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const scraped = await scrapeUrl(article.url);
  const cls = await buildArticleClassification(article.url, scraped.title, scraped.body, {
    mediaKind: scraped.mediaKind,
    durationSeconds: scraped.durationSeconds,
  });

  const updated = { ...article, ...cls, author: scraped.author?.trim() || article.author || "未知作者" };
  try {
    await updateArticle(updated, ownerId ?? null);
    return NextResponse.json({ article: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "db_not_configured") {
      return NextResponse.json(
        { error: "db_not_configured", message: "请先在 Vercel 设置 DATABASE_URL 后再刷新文章。" },
        { status: 503 },
      );
    }
    throw error;
  }
}
