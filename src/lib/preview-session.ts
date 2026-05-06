import type { NextRequest, NextResponse } from "next/server";

/** 开发环境 UI 预览：模拟已登录（非真实 Supabase / VIP 会话） */
export const PREVIEW_SESSION_COOKIE = "rp_ui_preview";

export const PREVIEW_SESSION_VALUE = "1";

/** 与 DB 无关联的固定 id，仅用于演示态下 listArticlesForUser 等返回空列表 */
export const PREVIEW_UI_USER_ID = "00000000-0000-4000-8000-00000000f001";

export const PREVIEW_UI_USER_EMAIL = "ui-preview@login-state.local";

export function isPreviewSessionAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** 防止开放重定向：仅允许站内 path + query + hash */
export function sanitizePreviewRedirectPath(raw: string): string {
  const p = (raw || "/").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return "/";
  try {
    const u = new URL(p, "http://local.invalid");
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

export function setPreviewSessionCookie(res: NextResponse): void {
  if (!isPreviewSessionAllowed()) return;
  res.cookies.set(PREVIEW_SESSION_COOKIE, PREVIEW_SESSION_VALUE, {
    path: "/",
    maxAge: 60 * 60 * 4,
    sameSite: "lax",
    httpOnly: true,
  });
}

export function clearPreviewSessionCookie(res: NextResponse): void {
  res.cookies.set(PREVIEW_SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
  });
}

/** 用请求 Host 拼跳转地址，避免 `new URL(path, req.url)` 在 dev 绑定 0.0.0.0 时把用户送到错误 origin */
export function buildPreviewRedirectUrl(req: NextRequest, path: string): URL {
  const host = req.headers.get("host")?.trim();
  if (host) {
    const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      xfProto === "http" || xfProto === "https"
        ? xfProto
        : req.nextUrl.protocol === "https:"
          ? "https"
          : "http";
    return new URL(path, `${proto}://${host}`);
  }
  return new URL(path, req.url);
}
