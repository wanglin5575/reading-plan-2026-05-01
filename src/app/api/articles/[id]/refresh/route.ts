import { NextResponse } from "next/server";
import { getArticle, recordTokenUsage, updateArticle, upsertUserRegistry } from "@/lib/db";
import { scrapeUrl } from "@/lib/scrape";
import { buildArticleClassification } from "@/lib/classify";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getRouteHandlerUser();
  const ownerId = session?.id ?? null;
  if (isAuthEnabled() && !ownerId) {
    return NextResponse.json({ error: "unauthorized", message: "请先登录。" }, { status: 401 });
  }
  if (session) {
    await upsertUserRegistry({
      userId: session.id,
      email: session.email,
      registeredAtIso: session.createdAt,
    });
  }
  const article = await getArticle(id, ownerId ?? null);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let scraped;
  try {
    scraped = await scrapeUrl(article.url);
  } catch (e) {
    console.error("[articles refresh] scrape", e);
    return NextResponse.json(
      { error: "scrape_failed", message: e instanceof Error ? e.message : "网页抓取失败" },
      { status: 502 },
    );
  }

  let cls;
  try {
    cls = await buildArticleClassification(article.url, scraped.title, scraped.body, {
      mediaKind: scraped.mediaKind,
      durationSeconds: scraped.durationSeconds,
      scrapeAuthor: scraped.author?.trim() || "",
      publishedIsoHint: scraped.publishedIsoHint,
      cacheUserId: ownerId,
      onAiUsage: (usage) => {
        if (usage && usage.totalTokens > 0 && session) {
          void recordTokenUsage({
            userId: session.id,
            source: "article_classify",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          });
        }
      },
    });
  } catch (e) {
    console.error("[articles refresh] AI classification", e);
    return NextResponse.json(
      {
        error: "ai_failed",
        message: e instanceof Error ? e.message : "AI 生成摘要或分类失败，请稍后重试",
      },
      { status: 503 },
    );
  }

  const updated = { ...article, ...cls };
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
