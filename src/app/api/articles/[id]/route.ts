import { NextResponse } from "next/server";
import { deleteArticle, getArticle, updateArticle } from "@/lib/db";
import type { Article } from "@/lib/types";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";
import { normalizeKeyPoints, validateReadDigest } from "@/lib/read-digest";

export const dynamic = "force-dynamic";

function parseMediaPatch(v: unknown): "article" | "video" | "audio" | undefined {
  if (v === "article" || v === "video" || v === "audio") return v;
  return undefined;
}

function applyDigest(article: Article, one: string, points: string[], action: string) {
  article.readOneLiner = one.trim();
  article.readKeyPoints = points;
  article.readAction = action.trim();
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ownerId = await getRouteHandlerUserId();
  if (isAuthEnabled() && !ownerId) {
    return NextResponse.json({ error: "unauthorized", message: "请先登录。" }, { status: 401 });
  }
  const article = await getArticle(id, ownerId ?? null);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: {
    status?: "todo" | "done";
    dueDate?: string;
    theme?: string;
    author?: string;
    title?: string;
    titleZh?: string;
    featured?: boolean;
    readOneLiner?: string;
    readKeyPoints?: string[];
    readAction?: string;
    summary?: string;
    mediaType?: unknown;
    estimatedMinutes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.status === "todo") {
    article.status = "todo";
    article.completedAt = null;
    article.readOneLiner = "";
    article.readKeyPoints = [];
    article.readAction = "";
  } else if (body.status === "done") {
    const mergedOne = body.readOneLiner ?? article.readOneLiner;
    const mergedAction = body.readAction ?? article.readAction;
    let mergedPoints = normalizeKeyPoints(body.readKeyPoints);
    if (!mergedPoints) mergedPoints = normalizeKeyPoints(article.readKeyPoints);
    if (!validateReadDigest(mergedOne, mergedAction, mergedPoints)) {
      return NextResponse.json(
        {
          error: "read_digest_required",
          message: "标记已读需填写：一句话总结、3 条重要观点（每条非空）、1 个行动项。",
        },
        { status: 400 },
      );
    }
    applyDigest(article, mergedOne!, mergedPoints!, mergedAction!);
    article.status = "done";
    article.completedAt = new Date().toISOString();
  } else if (article.status === "done") {
    if (typeof body.readOneLiner === "string") article.readOneLiner = body.readOneLiner.trim();
    if (typeof body.readAction === "string") article.readAction = body.readAction.trim();
    if (body.readKeyPoints !== undefined) {
      const pts = normalizeKeyPoints(body.readKeyPoints);
      if (!pts) {
        return NextResponse.json(
          { error: "read_key_points_invalid", message: "重要观点需恰好填写 3 条且均非空。" },
          { status: 400 },
        );
      }
      article.readKeyPoints = pts;
    }
  }

  if (body.dueDate) article.dueDate = body.dueDate;
  if (body.theme) article.theme = body.theme;
  if (typeof body.author === "string") article.author = body.author.trim() || "未知作者";
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json({ error: "title_required", message: "文章标题不能为空。" }, { status: 400 });
    }
    article.title = t;
  }
  if (typeof body.titleZh === "string") article.titleZh = body.titleZh.trim();
  if (typeof body.featured === "boolean") {
    article.featured = body.featured;
    article.recommendedDepth = body.featured ? "deep" : "skim";
  }

  if (typeof body.summary === "string") {
    const s = body.summary.trim();
    if (s) article.summary = s;
  }
  const mt = parseMediaPatch(body.mediaType);
  if (mt) article.mediaType = mt;
  if (typeof body.estimatedMinutes === "number" && Number.isFinite(body.estimatedMinutes)) {
    const m = Math.round(body.estimatedMinutes);
    if (m >= 1 && m <= 24 * 60) article.estimatedMinutes = m;
  }

  try {
    await updateArticle(article, ownerId ?? null);
    return NextResponse.json({ article });
  } catch (error) {
    if (error instanceof Error && error.message === "db_not_configured") {
      return NextResponse.json(
        { error: "db_not_configured", message: "请先在 Vercel 设置 DATABASE_URL 后再修改文章。" },
        { status: 503 },
      );
    }
    throw error;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ownerId = await getRouteHandlerUserId();
  if (isAuthEnabled() && !ownerId) {
    return NextResponse.json({ error: "unauthorized", message: "请先登录。" }, { status: 401 });
  }
  try {
    await deleteArticle(id, ownerId ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "db_not_configured") {
      return NextResponse.json(
        { error: "db_not_configured", message: "请先在 Vercel 设置 DATABASE_URL 后再删除文章。" },
        { status: 503 },
      );
    }
    throw error;
  }
}
