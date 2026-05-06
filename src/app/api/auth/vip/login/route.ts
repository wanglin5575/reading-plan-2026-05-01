import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth";
import { upsertUserRegistry, getVipByUsernameForAuth } from "@/lib/db";
import {
  normalizeVipUsername,
  signVipSessionToken,
  verifyVipPassword,
  vipSyntheticEmail,
  VIP_SESSION_COOKIE,
} from "@/lib/vip-auth";

export const dynamic = "force-dynamic";

const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { username?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? normalizeVipUsername(body.username) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (username.length < 2 || password.length < 6) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  }

  try {
    const row = await getVipByUsernameForAuth(username);
    if (!row || !row.enabled || !verifyVipPassword(password, row.passwordHash)) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    const token = signVipSessionToken({
      sub: row.id,
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
    });

    await upsertUserRegistry({
      userId: row.id,
      email: vipSyntheticEmail(row.username),
      registeredAtIso: row.createdAt,
    });

    const res = NextResponse.json({ ok: true, mustChangePassword: row.mustChangePassword });
    res.cookies.set(VIP_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SEC,
    });
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "missing_vip_session_secret") {
      return NextResponse.json({ error: "server_misconfigured_vip_secret" }, { status: 503 });
    }
    throw e;
  }
}
