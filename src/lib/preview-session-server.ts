import { cookies } from "next/headers";
import {
  isPreviewSessionAllowed,
  PREVIEW_SESSION_COOKIE,
  PREVIEW_SESSION_VALUE,
  PREVIEW_UI_USER_EMAIL,
  PREVIEW_UI_USER_ID,
} from "@/lib/preview-session";
/**
 * 开发环境：读取「UI 演示登录」Cookie。
 * 优先级低于真实 Supabase / VIP（由 getServerAuthUser 调用顺序保证）。
 */
export async function tryReadPreviewUiSessionUser(): Promise<{
  id: string;
  email: string;
  createdAt: string | null;
  isVip: boolean;
} | null> {
  if (!isPreviewSessionAllowed()) return null;
  try {
    const jar = await cookies();
    if (jar.get(PREVIEW_SESSION_COOKIE)?.value !== PREVIEW_SESSION_VALUE) return null;
    return {
      id: PREVIEW_UI_USER_ID,
      email: PREVIEW_UI_USER_EMAIL,
      createdAt: null,
      isVip: false,
    };
  } catch {
    return null;
  }
}
