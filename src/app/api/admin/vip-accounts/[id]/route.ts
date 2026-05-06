import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { updateVipAccountRow } from "@/lib/db";
import { hashVipPassword } from "@/lib/vip-auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getRouteHandlerUser();
  if (!session?.email || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let body: { password?: unknown; enabled?: unknown };
  try {
    body = (await req.json()) as { password?: unknown; enabled?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: { passwordHash?: string; enabled?: boolean } = {};
  if (typeof body.password === "string" && body.password.length >= 6) {
    patch.passwordHash = hashVipPassword(body.password);
  }
  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled;
  }
  if (patch.passwordHash == null && typeof patch.enabled !== "boolean") {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  try {
    await updateVipAccountRow(id.trim(), patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
