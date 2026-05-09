import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { listRecommendationsSent } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const items = await listRecommendationsSent(session.id);
  return NextResponse.json({ items });
}
