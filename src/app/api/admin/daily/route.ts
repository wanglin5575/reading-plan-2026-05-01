import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { getAdminDailySeries, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

function addDays(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id || !session.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "db_not_configured", series: [] }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to")?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 7), 366);
  const from = addDays(to, -(days - 1));

  const isAdmin = isAdminEmail(session.email);
  const scopeSelf = searchParams.get("scope") === "self";
  const filterUserId = isAdmin && !scopeSelf ? null : session.id;

  const series = await getAdminDailySeries({ fromDay: from, toDay: to, filterUserId });
  return NextResponse.json({ from, to, series });
}
