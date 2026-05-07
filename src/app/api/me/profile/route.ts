import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { ensureUserProfile, getUserProfile, updateUserNickname } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const profile = await ensureUserProfile(session.id);
  return NextResponse.json({
    userId: session.id,
    email: session.email,
    nickname: profile.nickname,
    lastFansSeenAt: profile.lastFansSeenAt,
  });
}

export async function PATCH(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { nickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const nickname = typeof body.nickname === "string" ? body.nickname : "";
  const r = await updateUserNickname(session.id, nickname);
  if (r === "invalid") {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }
  if (r === "taken") {
    return NextResponse.json({ error: "nickname_taken" }, { status: 409 });
  }
  const p = await getUserProfile(session.id);
  return NextResponse.json({ ok: true, nickname: p?.nickname ?? nickname.trim() });
}
