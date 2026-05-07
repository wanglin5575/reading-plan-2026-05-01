import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { listArticlesForUser, listFollowsByFollower } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = new URL(req.url).searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }
  const follows = await listFollowsByFollower(session.id);
  if (!follows.some((f) => f.followedId === userId)) {
    return NextResponse.json({ error: "not_following" }, { status: 403 });
  }
  const articles = await listArticlesForUser(userId);
  const todo = articles.filter((a) => a.status === "todo");
  const done = articles.filter((a) => a.status === "done");
  return NextResponse.json({ todo, done });
}
