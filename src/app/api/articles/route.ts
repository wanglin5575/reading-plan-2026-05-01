import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { insertArticle, listArticlesForUser, recordTokenUsage, upsertUserRegistry } from "@/lib/db";
import { buildArticleClassification, buildArticleClassificationFallback } from "@/lib/classify";
import { scrapeUrl, type ScrapeResult } from "@/lib/scrape";
import type { MediaKind } from "@/lib/media-kind";
import { todayIso, shiftDays } from "@/lib/plan";
import type { Article } from "@/lib/types";
import { getRouteHandlerUser, getRouteHandlerUserId } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";
import { normalizeKeyPointsSlots, validateReadDigest } from "@/lib/read-digest";
import { recommendMyArticleToUser } from "@/lib/recommend-article";

export const dynamic = "force-dynamic";

function parseMediaKind(v: unknown): MediaKind {
  if (v === "video" || v === "audio" || v === "article") return v;
  return "article";
}

function parseScrapeFromBody(raw: unknown): ScrapeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title : "";
  const author = typeof o.author === "string" ? o.author : "";
  const body = typeof o.body === "string" ? o.body : "";
  const source = o.source === "firecrawl" || o.source === "fallback" ? o.source : "fallback";
  const publishedIsoHint =
    o.publishedIsoHint === null ? null : typeof o.publishedIsoHint === "string" ? o.publishedIsoHint : null;
  const durationSeconds =
    typeof o.durationSeconds === "number" && Number.isFinite(o.durationSeconds) ? o.durationSeconds : null;
  const ogType = typeof o.ogType === "string" ? o.ogType : undefined;
  const rawMarkdown = typeof o.rawMarkdown === "string" ? o.rawMarkdown : undefined;
  const metadata = o.metadata && typeof o.metadata === "object" && !Array.isArray(o.metadata) ? (o.metadata as Record<string, unknown>) : undefined;
  return {
    title,
    author,
    body,
    source,
    ogType,
    mediaKind: parseMediaKind(o.mediaKind),
    durationSeconds,
    publishedIsoHint,
    rawMarkdown,
    metadata,
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
    readOneLiner?: string;
    readKeyPoints?: string[];
    readAction?: string;
    scrape?: unknown;
    recommendToUserId?: string;
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
  const fromClient = parseScrapeFromBody(payload.scrape);
  let scraped: ScrapeResult;
  if (fromClient) {
    scraped = fromClient;
  } else {
    try {
      scraped = await scrapeUrl(parsed.toString());
    } catch (e) {
      console.error("[articles POST] scrape", e);
      return NextResponse.json(
        { error: "scrape_failed", message: e instanceof Error ? e.message : "网页抓取失败" },
        { status: 502 },
      );
    }
  }

  let classification: Awaited<ReturnType<typeof buildArticleClassification>>;
  try {
    classification = await buildArticleClassification(parsed.toString(), scraped.title, scraped.body, {
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
    console.error("[articles POST] AI classification", e);
    classification = buildArticleClassificationFallback(parsed.toString(), scraped.title, scraped.body, {
      mediaKind: scraped.mediaKind,
      durationSeconds: scraped.durationSeconds,
      scrapeAuthor: scraped.author?.trim() || "",
      publishedIsoHint: scraped.publishedIsoHint,
    });
  }

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

  let recommendNote: string | null = null;
  const recId = typeof payload.recommendToUserId === "string" ? payload.recommendToUserId.trim() : "";
  if (recId && ownerId) {
    const rec = await recommendMyArticleToUser({
      fromUserId: ownerId,
      toUserId: recId,
      source: article,
    });
    if (!rec.ok) recommendNote = rec.error;
  }

  return NextResponse.json({ article, recommendNote }, { status: 201 });
}
