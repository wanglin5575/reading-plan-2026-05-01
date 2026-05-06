import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** httpOnly Cookie 名称 */
export const VIP_SESSION_COOKIE = "rp_vip_session";

export function vipSyntheticEmail(username: string): string {
  const raw = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 48);
  const u = raw || "user";
  return `vip_${u}@vip.local`;
}

export function normalizeVipUsername(username: string): string {
  return username.trim().toLowerCase().slice(0, 64);
}

export function hashVipPassword(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, 64);
  return `scrypt1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyVipPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt1" || parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const key = scryptSync(plain, salt, 64);
    if (key.length !== expected.length) return false;
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

let warnedDevVipFallback = false;

/**
 * VIP 会话 HMAC 密钥：优先显式环境变量；否则从已配置的服务端密钥派生（与数据库/Supabase 同源，部署通常已具备）。
 * 生产环境仍建议单独设置 READING_PLAN_VIP_SESSION_SECRET，便于轮换且与 DB 凭据解耦。
 */
export function getVipSessionSecret(): string {
  const explicit = process.env.READING_PLAN_VIP_SESSION_SECRET?.trim();
  if (explicit) return explicit;

  const material =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    "";

  if (material.length >= 8) {
    return createHash("sha256").update("reading-plan-vip-session-v1|").update(material).digest("base64url");
  }

  if (process.env.NODE_ENV !== "production") {
    if (!warnedDevVipFallback) {
      console.warn(
        "[vip-auth] READING_PLAN_VIP_SESSION_SECRET 未设置且无足够长度的数据库/Service Role 配置，使用开发环境内置回退密钥。",
      );
      warnedDevVipFallback = true;
    }
    return "reading-plan-vip-dev-fallback-secret";
  }

  throw new Error("missing_vip_session_secret");
}

/** JWT-like：body 为 JSON UTF-8，HMAC-SHA256 防篡改 */
export function signVipSessionToken(payload: { sub: string; exp: number }): string {
  const secret = getVipSessionSecret();
  const bodyB = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = createHmac("sha256", secret).update(bodyB).digest();
  return `${b64url(bodyB)}.${b64url(sig)}`;
}

export function verifyVipSessionToken(token: string): { sub: string; exp: number } | null {
  let secret: string;
  try {
    secret = getVipSessionSecret();
  } catch {
    return null;
  }
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  let bodyB: Buffer;
  let sig: Buffer;
  try {
    bodyB = Buffer.from(token.slice(0, i), "base64url");
    sig = Buffer.from(token.slice(i + 1), "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(bodyB).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(bodyB.toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const sub = (payload as { sub?: unknown }).sub;
  const exp = (payload as { exp?: unknown }).exp;
  if (typeof sub !== "string" || typeof exp !== "number") return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return { sub, exp };
}
