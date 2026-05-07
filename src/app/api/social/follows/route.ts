import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { createFollow, deleteFollow, listFollowsByFollower } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const follows = await listFollowsByFollower(session.id);
  return NextResponse.json({ follows });
}

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { followedUserId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const fid = body.followedUserId?.trim() ?? "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!fid) {
    return NextResponse.json({ error: "missing_followed_user_id" }, { status: 400 });
  }
  const r = await createFollow(session.id, fid, label || "关注");
  if (r === "self") {
    return NextResponse.json({ error: "cannot_follow_self" }, { status: 400 });
  }
  if (r === "exists") {
    return NextResponse.json({ ok: true, already: true });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const followedUserId = new URL(req.url).searchParams.get("followedUserId")?.trim() ?? "";
  if (!followedUserId) {
    return NextResponse.json({ error: "missing_followed_user_id" }, { status: 400 });
  }
  await deleteFollow(session.id, followedUserId);
  return NextResponse.json({ ok: true });
}
