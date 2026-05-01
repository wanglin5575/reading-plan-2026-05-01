import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth";
import { getServerAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authEnabled: false, email: null });
  }
  const user = await getServerAuthUser();
  return NextResponse.json({ authEnabled: true, email: user?.email ?? null });
}
