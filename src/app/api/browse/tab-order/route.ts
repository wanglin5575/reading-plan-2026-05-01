import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { reorderBrowseStripTab } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    action?: string;
    target?: { kind?: string; topicId?: string; followedUserId?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "pin" && action !== "up" && action !== "down") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  const t = body.target;
  if (!t || typeof t !== "object") {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }
  let target: { kind: "topic"; topicId: string } | { kind: "follow"; followedUserId: string };
  if (t.kind === "topic" && typeof t.topicId === "string" && t.topicId.trim()) {
    target = { kind: "topic", topicId: t.topicId.trim() };
  } else if (t.kind === "follow" && typeof t.followedUserId === "string" && t.followedUserId.trim()) {
    target = { kind: "follow", followedUserId: t.followedUserId.trim() };
  } else {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  const r = await reorderBrowseStripTab(session.id, target, action);
  if (!r.ok) {
    if (r.error === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (r.error === "db_not_configured") {
      return NextResponse.json({ error: "需要配置 DATABASE_URL。" }, { status: 503 });
    }
    return NextResponse.json({ error: r.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
