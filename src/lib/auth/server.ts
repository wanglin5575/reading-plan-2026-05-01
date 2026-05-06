import { isAuthEnabled } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryReadVipSessionUser } from "@/lib/auth/vip-session-server";
import { tryReadPreviewUiSessionUser } from "@/lib/preview-session-server";

export type AppAuthUser = {
  id: string;
  email: string;
  createdAt: string | null;
  /** 站内置 VIP（非 Supabase），邮箱为 `vip_*@vip.local` 合成地址 */
  isVip: boolean;
};

export async function getServerAuthUser(): Promise<AppAuthUser | null> {
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
        return {
          id: user.id,
          email,
          createdAt,
          isVip: false,
        };
      }
    }
  } catch {
    /* VIP */
  }

  const vip = await tryReadVipSessionUser();
  if (vip) {
    return {
      id: vip.id,
      email: vip.email,
      createdAt: vip.createdAt,
      isVip: true,
    };
  }

  const previewUi = await tryReadPreviewUiSessionUser();
  if (previewUi) return previewUi;

  return null;
}
