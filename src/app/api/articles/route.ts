import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { insertArticle, listArticlesForUser } from "@/lib/db";
import { buildArticleClassification } from "@/lib/classify";
import { scrapeUrl } from "@/lib/scrape";
import { todayIso, shiftDays } from "@/lib/plan";
import type { Article } from "@/lib/types";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getRouteHandlerUserId();
  return NextResponse.json({ articles: await listArticlesForUser(uid ?? null) });
}

export async function POST(req: Request) {
  let payload: { url?: string; dueDate?: string; featured?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ownerId = await getRouteHandlerUserId();
  if (isAuthEnabled() && !ownerId) {
    return NextResponse.json(
      { error: "unauthorized", message: "请先注册或登录后再添加文章（打开「我的」页）。" },
      { status: 401 },
    );
  }

  const url = payload.url?.trim();
  if (!url) return NextResponse.json({ error: "url_required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const dueDate = payload.dueDate || shiftDays(todayIso(), 2);
  const scraped = await scrapeUrl(parsed.toString());
  const classification = await buildArticleClassification(parsed.toString(), scraped.title, scraped.body);
  const markIntensive = Boolean(payload.featured);

  const article: Article = {
    id: randomUUID(),
    url: parsed.toString(),
    status: "todo",
    addedAt: new Date().toISOString(),
    dueDate,
    completedAt: null,
    author: scraped.author?.trim() || "未知作者",
    customTags: [],
    featured: markIntensive,
    readOneLiner: "",
    readKeyPoints: [],
    readAction: "",
    ...classification,
    recommendedDepth: markIntensive ? "deep" : classification.recommendedDepth,
  };

  try {
    await insertArticle(article, ownerId);
    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return NextResponse.json(
        { error: "unauthorized", message: "请先注册或登录后再添加文章。" },
        { status: 401 },
      );
    }
    if (error instanceof Error && error.message === "db_not_configured") {
      return NextResponse.json(
        { error: "db_not_configured", message: "请先在 Vercel 设置 DATABASE_URL 后再添加文章。" },
        { status: 503 },
      );
    }
    throw error;
  }
}
