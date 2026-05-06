import { NextResponse } from "next/server";
import { tryReadVipSessionUser } from "@/lib/auth/vip-session-server";

export const dynamic = "force-dynamic";

/** 当前 VIP 会话是否仍需改密（管理员初始密码/管理员重置后为 true） */
export async function GET() {
  const vip = await tryReadVipSessionUser();
  if (!vip) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ mustChangePassword: Boolean(vip.mustChangePassword) });
}
