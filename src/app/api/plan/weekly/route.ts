import { NextResponse } from "next/server";
import { listArticlesForUser } from "@/lib/db";
import { buildWeeklyReview } from "@/lib/plan";
import { getRouteHandlerUserId } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getRouteHandlerUserId();
  return NextResponse.json({ review: buildWeeklyReview(await listArticlesForUser(uid ?? null)) });
}
