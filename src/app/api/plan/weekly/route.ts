import { NextResponse } from "next/server";
import { listArticles } from "@/lib/db";
import { buildWeeklyReview } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ review: buildWeeklyReview(listArticles()) });
}
