import { NextRequest, NextResponse } from "next/server";
import {
  buildPreviewRedirectUrl,
  clearPreviewSessionCookie,
  sanitizePreviewRedirectPath,
} from "@/lib/preview-session";

export const dynamic = "force-dynamic";

/** 清除「演示登录」Cookie 后跳转到站内路径（不退出真实 Supabase / VIP） */
export async function GET(req: NextRequest) {
  const path = sanitizePreviewRedirectPath(req.nextUrl.searchParams.get("path") ?? "/");
  const res = NextResponse.redirect(buildPreviewRedirectUrl(req, path));
  clearPreviewSessionCookie(res);
  return res;
}
