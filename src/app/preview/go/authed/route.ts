import { NextRequest, NextResponse } from "next/server";
import {
  buildPreviewRedirectUrl,
  isPreviewSessionAllowed,
  sanitizePreviewRedirectPath,
  setPreviewSessionCookie,
} from "@/lib/preview-session";

export const dynamic = "force-dynamic";

/**
 * 开发环境：设置「演示登录」Cookie 后跳转。
 * 若浏览器中已有真实 Supabase 会话，仍以真实用户为准（见 getServerAuthUser 顺序）。
 */
export async function GET(req: NextRequest) {
  if (!isPreviewSessionAllowed()) {
    return NextResponse.json({ error: "preview_authed_only_in_development" }, { status: 403 });
  }
  const path = sanitizePreviewRedirectPath(req.nextUrl.searchParams.get("path") ?? "/");
  const res = NextResponse.redirect(buildPreviewRedirectUrl(req, path));
  setPreviewSessionCookie(res);
  return res;
}
