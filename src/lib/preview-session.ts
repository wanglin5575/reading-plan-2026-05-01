import type { NextRequest, NextResponse } from "next/server";

/** 开发环境 UI 预览：模拟已登录（非真实 Supabase / VIP 会话） */
export const PREVIEW_SESSION_COOKIE = "rp_ui_preview";

export const PREVIEW_SESSION_VALUE = "1";

/** 社交演示：关注者 / 被关注者（与默认演示用户区分，便于两条预览链路） */
export const PREVIEW_SESSION_FOLLOWER_VALUE = "follower";
export const PREVIEW_SESSION_FOLLOWED_VALUE = "followed";

/** 与 DB 无关联的固定 id，仅用于演示态下 listArticlesForUser 等返回空列表 */
export const PREVIEW_UI_USER_ID = "00000000-0000-4000-8000-00000000f001";

export const PREVIEW_UI_USER_EMAIL = "ui-preview@login-state.local";

export const PREVIEW_UI_FOLLOWER_ID = "00000000-0000-4000-8000-00000000f002";
export const PREVIEW_UI_FOLLOWER_EMAIL = "social-follower@preview.local";

export const PREVIEW_UI_FOLLOWED_ID = "00000000-0000-4000-8000-00000000f003";
export const PREVIEW_UI_FOLLOWED_EMAIL = "social-followed@preview.local";

export type PreviewUiPersona = "default" | "follower" | "followed";

export function previewPersonaFromCookieValue(raw: string | undefined): PreviewUiPersona {
  if (raw === PREVIEW_SESSION_FOLLOWED_VALUE) return "followed";
  if (raw === PREVIEW_SESSION_FOLLOWER_VALUE) return "follower";
  return "default";
}

export function isActivePreviewSessionCookie(raw: string | undefined): boolean {
  return (
    raw === PREVIEW_SESSION_VALUE ||
    raw === PREVIEW_SESSION_FOLLOWER_VALUE ||
    raw === PREVIEW_SESSION_FOLLOWED_VALUE
  );
}

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

export function setPreviewSessionCookie(res: NextResponse, persona: PreviewUiPersona = "default"): void {
  if (!isPreviewSessionAllowed()) return;
  const v =
    persona === "follower"
      ? PREVIEW_SESSION_FOLLOWER_VALUE
      : persona === "followed"
        ? PREVIEW_SESSION_FOLLOWED_VALUE
        : PREVIEW_SESSION_VALUE;
  res.cookies.set(PREVIEW_SESSION_COOKIE, v, {
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
