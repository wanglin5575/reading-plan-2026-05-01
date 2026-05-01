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

/** 随览「一键已读」：满足 PATCH 校验的占位读后字段（可稍后在已读里改） */
function quickReadDigestFromScrape(title: string, summary: string, bodyExcerpt: string) {
  const t = title.trim() || "无标题";
  const sum = (summary || bodyExcerpt || "").trim();
  const one = (sum || `随览收录：${t}`).slice(0, 200);
  const k2 = sum.length > 8 ? sum.slice(0, 80) : `摘要：${t.slice(0, 60)}`;
  return {
    readOneLiner: one,
    readKeyPoints: [t.slice(0, 80), k2, "由随览一键标记已读，可在详情中编辑"],
    readAction: "在「已读」中补充具体行动项。",
  };
}

export async function GET() {
  const uid = await getRouteHandlerUserId();
  return NextResponse.json({ articles: await listArticlesForUser(uid ?? null) });
}

export async function POST(req: Request) {
  let payload: {
    url?: string;
    dueDate?: string;
    featured?: boolean;
    quickDone?: boolean;
    browseTopicName?: string;
  };
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
  const quickDone = Boolean(payload.quickDone);
  const topicHint =
    typeof payload.browseTopicName === "string" ? payload.browseTopicName.trim() : "";
  const theme = topicHint ? `随览 / ${topicHint}` : classification.theme;
  const excerptForDigest = scraped.body.replace(/\s+/g, " ").trim().slice(0, 480);
  const digest = quickDone ? quickReadDigestFromScrape(scraped.title, classification.summary, excerptForDigest) : null;

  const article: Article = {
    id: randomUUID(),
    url: parsed.toString(),
    status: quickDone ? "done" : "todo",
    addedAt: new Date().toISOString(),
    dueDate,
    completedAt: quickDone ? new Date().toISOString() : null,
    author: scraped.author?.trim() || "未知作者",
    customTags: quickDone ? ["随览"] : [],
    featured: markIntensive,
    readOneLiner: digest?.readOneLiner ?? "",
    readKeyPoints: digest?.readKeyPoints ?? [],
    readAction: digest?.readAction ?? "",
    ...classification,
    theme,
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
