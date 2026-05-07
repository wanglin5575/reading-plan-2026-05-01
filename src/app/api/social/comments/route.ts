import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { insertSocialComment, listFollowsByFollower, listSocialComments } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const articleId = new URL(req.url).searchParams.get("articleId")?.trim() ?? "";
  const articleOwnerId = new URL(req.url).searchParams.get("articleOwnerId")?.trim() ?? "";
  if (!articleId || !articleOwnerId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const ok = await canAccessSocialArticle(session.id, articleOwnerId);
  if (!ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const comments = await listSocialComments(articleId, articleOwnerId);
  return NextResponse.json({ comments });
}

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { articleId?: string; articleOwnerId?: string; parentId?: string | null; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const articleId = body.articleId?.trim() ?? "";
  const articleOwnerId = body.articleOwnerId?.trim() ?? "";
  const text = typeof body.body === "string" ? body.body : "";
  if (!articleId || !articleOwnerId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const ok = await canAccessSocialArticle(session.id, articleOwnerId);
  if (!ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const row = await insertSocialComment({
    articleId,
    articleOwnerId,
    authorId: session.id,
    parentId: body.parentId ?? null,
    body: text,
  });
  if (!row) {
    return NextResponse.json({ error: "empty_body" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, comment: row });
}

async function canAccessSocialArticle(viewerId: string, articleOwnerId: string): Promise<boolean> {
  if (viewerId === articleOwnerId) return true;
  const follows = await listFollowsByFollower(viewerId);
  return follows.some((f) => f.followedId === articleOwnerId);
}
