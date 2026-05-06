import { NextResponse } from "next/server";
import { tryReadVipSessionUser } from "@/lib/auth/vip-session-server";
import { updateVipAccountRow } from "@/lib/db";
import { hashVipPassword } from "@/lib/vip-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const vip = await tryReadVipSessionUser();
  if (!vip) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { newPassword?: unknown };
  try {
    body = (await req.json()) as { newPassword?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }

  try {
    await updateVipAccountRow(vip.id, {
      passwordHash: hashVipPassword(newPassword),
      mustChangePassword: false,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
