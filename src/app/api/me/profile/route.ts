import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { ensureUserProfile, getUserProfile, updateUserNickname, updateUserReadingPrompt } from "@/lib/db";

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
    readingRole: profile.readingRole,
    readingDuties: profile.readingDuties,
    readingGoal: profile.readingGoal,
    readingPromptExtra: profile.readingPromptExtra,
  });
}

export async function PATCH(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    nickname?: string;
    readingRole?: string;
    readingDuties?: string;
    readingGoal?: string;
    readingPromptExtra?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.nickname === "string") {
    const r = await updateUserNickname(session.id, body.nickname);
    if (r === "invalid") {
      return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
    }
    if (r === "taken") {
      return NextResponse.json({ error: "nickname_taken" }, { status: 409 });
    }
  }

  if (
    body.readingRole !== undefined ||
    body.readingDuties !== undefined ||
    body.readingGoal !== undefined ||
    body.readingPromptExtra !== undefined
  ) {
    try {
      await updateUserReadingPrompt(session.id, {
        readingRole: body.readingRole,
        readingDuties: body.readingDuties,
        readingGoal: body.readingGoal,
        readingPromptExtra: body.readingPromptExtra,
      });
    } catch {
      return NextResponse.json({ error: "update_reading_prompt_failed" }, { status: 500 });
    }
  }

  const p = await getUserProfile(session.id);
  return NextResponse.json({
    ok: true,
    nickname: p?.nickname ?? "",
    readingRole: p?.readingRole ?? "",
    readingDuties: p?.readingDuties ?? "",
    readingGoal: p?.readingGoal ?? "",
    readingPromptExtra: p?.readingPromptExtra ?? "",
  });
}
