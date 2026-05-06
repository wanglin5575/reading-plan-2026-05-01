import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

/** 供客户端蒙层判断：含 Supabase 与 VIP httpOnly 会话 */
export async function GET() {
  const u = await getRouteHandlerUser();
  return NextResponse.json({ signedIn: Boolean(u?.id) });
}
