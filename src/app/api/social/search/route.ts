import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { searchUsersToFollow } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }
  const users = await searchUsersToFollow(q, session.id);
  return NextResponse.json({ users });
}
