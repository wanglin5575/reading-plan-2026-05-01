import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { createVipAccountRow, deleteVipAccountRow, listVipAccounts, updateVipAccountRow } from "@/lib/db";
import { hashVipPassword, normalizeVipUsername } from "@/lib/vip-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.email || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const accounts = await listVipAccounts();
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.email || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown; enabled?: unknown };
  try {
    body = (await req.json()) as { username?: unknown; password?: unknown; enabled?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const username = typeof body.username === "string" ? normalizeVipUsername(body.username) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (username.length < 2 || password.length < 6) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  try {
    const id = await createVipAccountRow(username, hashVipPassword(password));
    if (typeof body.enabled === "boolean" && body.enabled === false) {
      await updateVipAccountRow(id, { enabled: false });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    return NextResponse.json({ error: msg || "create_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.email || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    await deleteVipAccountRow(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
