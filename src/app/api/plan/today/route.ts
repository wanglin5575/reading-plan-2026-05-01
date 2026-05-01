import { NextResponse } from "next/server";
import { listArticles } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ plan: buildDailyPlan(await listArticles()) });
}
