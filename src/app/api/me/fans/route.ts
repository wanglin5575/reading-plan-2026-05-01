import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import {
  countFansSince,
  ensureUserProfile,
  getUserProfile,
  listFansForUser,
  listFollowsByFollower,
  createFollow,
  markFansSeen,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureUserProfile(session.id);
  const profile = await getUserProfile(session.id);
  const since = profile?.lastFansSeenAt ?? null;
  const newCount = await countFansSince(session.id, since);
  const fans = await listFansForUser(session.id);
  const myFollows = await listFollowsByFollower(session.id);
  const followingSet = new Set(myFollows.map((f) => f.followedId));
  return NextResponse.json({
    fans: fans.map((f) => ({
      ...f,
      isFollowingBack: followingSet.has(f.followerId),
    })),
    newFanCount: newCount,
    lastFansSeenAt: profile?.lastFansSeenAt ?? null,
  });
}

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { action?: string; followerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.action === "ack_seen") {
    await markFansSeen(session.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "follow_back" && body.followerId) {
    const r = await createFollow(session.id, body.followerId.trim(), "回关");
    if (r === "self") return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true, already: r === "exists" });
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
