import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import {
  countFansSince,
  ensureUserProfile,
  getUserProfile,
  listFansForUser,
  listFollowingEnriched,
  createFollow,
  markFansSeen,
  upsertFanLabel,
  getFanLabel,
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
  const fansRaw = await listFansForUser(session.id);
  const following = await listFollowingEnriched(session.id);
  const followingSet = new Set(following.map((f) => f.followedId));
  const fans = await Promise.all(
    fansRaw.map(async (f) => ({
      ...f,
      isFollowingBack: followingSet.has(f.followerId),
      myLabel: await getFanLabel(session.id, f.followerId),
    })),
  );
  return NextResponse.json({
    fans,
    following,
    newFanCount: newCount,
    lastFansSeenAt: profile?.lastFansSeenAt ?? null,
  });
}

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { action?: string; followerId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.action === "set_fan_label" && body.followerId) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    await upsertFanLabel(session.id, body.followerId.trim(), label || "");
    return NextResponse.json({ ok: true });
  }
  if (body.action === "ack_seen") {
    await markFansSeen(session.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "follow_back" && body.followerId) {
    const fid = body.followerId.trim();
    const prof = await getUserProfile(fid);
    const nick = prof?.nickname?.trim() || "书友";
    const r = await createFollow(session.id, fid, `${nick}的Plan`.slice(0, 120));
    if (r === "self") return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true, already: r === "exists" });
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
