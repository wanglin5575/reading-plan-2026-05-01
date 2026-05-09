import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { cancelRecommendationBySender, getArticle } from "@/lib/db";
import { recommendMyArticleToUser } from "@/lib/recommend-article";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { targetUserId?: string; sourceArticleId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const targetUserId = body.targetUserId?.trim() ?? "";
  const sourceArticleId = body.sourceArticleId?.trim() ?? "";
  if (!targetUserId || !sourceArticleId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const source = await getArticle(sourceArticleId, session.id);
  if (!source) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const rec = await recommendMyArticleToUser({
    fromUserId: session.id,
    toUserId: targetUserId,
    source,
  });
  if (!rec.ok) {
    return NextResponse.json({ error: "recommend_failed", message: rec.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, targetArticleId: rec.targetArticleId });
}

export async function DELETE(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { recommendationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const recommendationId = body.recommendationId?.trim() ?? "";
  if (!recommendationId) {
    return NextResponse.json({ error: "missing_recommendation_id" }, { status: 400 });
  }
  const r = await cancelRecommendationBySender(session.id, recommendationId);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 503 });
  }
  return NextResponse.json({ ok: true });
}
