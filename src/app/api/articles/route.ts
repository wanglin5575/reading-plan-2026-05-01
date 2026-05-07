import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { insertArticle, listArticlesForUser, recordTokenUsage, upsertUserRegistry } from "@/lib/db";
import { buildArticleClassification } from "@/lib/classify";
import { scrapeUrl } from "@/lib/scrape";
import { todayIso, shiftDays } from "@/lib/plan";
import type { Article } from "@/lib/types";
import { getRouteHandlerUser, getRouteHandlerUserId } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";
import { normalizeKeyPointsSlots, validateReadDigest } from "@/lib/read-digest";

export const dynamic = "force-dynamic";

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
    readOneLiner?: string;
    readKeyPoints?: string[];
    readAction?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const session = await getRouteHandlerUser();
  const ownerId = session?.id ?? null;
  if (isAuthEnabled() && !ownerId) {
    return NextResponse.json(
      { error: "unauthorized", message: "请先注册或登录后再添加文章（打开「我的」页）。" },
      { status: 401 },
    );
  }
  if (session) {
    await upsertUserRegistry({
      userId: session.id,
      email: session.email,
      registeredAtIso: session.createdAt,
    });
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
  const classification = await buildArticleClassification(parsed.toString(), scraped.title, scraped.body, {
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
  const markIntensive = Boolean(payload.featured);
  const quickDone = Boolean(payload.quickDone);
  const topicHint =
    typeof payload.browseTopicName === "string" ? payload.browseTopicName.trim() : "";
  const theme = topicHint ? `随览 / ${topicHint}` : classification.theme;

  let digest: { readOneLiner: string; readKeyPoints: string[]; readAction: string } | null = null;
  if (quickDone) {
    const points = normalizeKeyPointsSlots(payload.readKeyPoints);
    const one = typeof payload.readOneLiner === "string" ? payload.readOneLiner.trim() : "";
    const action = typeof payload.readAction === "string" ? payload.readAction.trim() : "";
    if (!validateReadDigest(one, action)) {
      return NextResponse.json(
        {
          error: "read_digest_required",
          message: "随览加入已读需填写：一句话总结、1 个行动项（重要观点选填）。",
        },
        { status: 400 },
      );
    }
    digest = { readOneLiner: one, readKeyPoints: points, readAction: action };
  }

  const article: Article = {
    id: randomUUID(),
    url: parsed.toString(),
    status: quickDone ? "done" : "todo",
    addedAt: new Date().toISOString(),
    dueDate,
    completedAt: quickDone ? new Date().toISOString() : null,
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
