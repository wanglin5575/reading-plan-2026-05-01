import { cookies } from "next/headers";
import {
  isActivePreviewSessionCookie,
  isPreviewSessionAllowed,
  PREVIEW_SESSION_COOKIE,
  PREVIEW_UI_FOLLOWED_EMAIL,
  PREVIEW_UI_FOLLOWED_ID,
  PREVIEW_UI_FOLLOWER_EMAIL,
  PREVIEW_UI_FOLLOWER_ID,
  PREVIEW_UI_USER_EMAIL,
  PREVIEW_UI_USER_ID,
  previewPersonaFromCookieValue,
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
    const raw = jar.get(PREVIEW_SESSION_COOKIE)?.value;
    if (!isActivePreviewSessionCookie(raw)) return null;
    const persona = previewPersonaFromCookieValue(raw);
    const id =
      persona === "follower" ? PREVIEW_UI_FOLLOWER_ID : persona === "followed" ? PREVIEW_UI_FOLLOWED_ID : PREVIEW_UI_USER_ID;
    const email =
      persona === "follower"
        ? PREVIEW_UI_FOLLOWER_EMAIL
        : persona === "followed"
          ? PREVIEW_UI_FOLLOWED_EMAIL
          : PREVIEW_UI_USER_EMAIL;
    return {
      id,
      email,
      createdAt: null,
      isVip: false,
    };
  } catch {
    return null;
  }
}
