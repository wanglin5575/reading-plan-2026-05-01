import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAuthEnabled } from "@/lib/auth";
import { tryReadVipSessionUser } from "@/lib/auth/vip-session-server";
import { tryReadPreviewUiSessionUser } from "@/lib/preview-session-server";

/** API Route / Server Action：当前请求的登录用户 id（未启用 Auth 时为 null） */
export async function getRouteHandlerUserId(): Promise<string | null> {
  const u = await getRouteHandlerUser();
  return u?.id ?? null;
}

/** 含邮箱与 Supabase 创建时间，便于后台会员登记与用量归因 */
export async function getRouteHandlerUser(): Promise<{
  id: string;
  email: string;
  createdAt: string | null;
} | null> {
  if (!isAuthEnabled()) return null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user?.id) {
      const email = user.email?.trim() || "";
      if (email) {
        const createdAt =
          typeof user.created_at === "string"
            ? user.created_at
            : user.created_at != null
              ? String(user.created_at)
              : null;
        return { id: user.id, email, createdAt };
      }
    }
  } catch {
    /* fall through to VIP */
  }
  const vip = await tryReadVipSessionUser();
  if (vip) return vip;

  const previewUi = await tryReadPreviewUiSessionUser();
  if (previewUi) {
    return {
      id: previewUi.id,
      email: previewUi.email,
      createdAt: previewUi.createdAt,
    };
  }
  return null;
}
