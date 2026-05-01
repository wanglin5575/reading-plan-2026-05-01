import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAuthEnabled } from "@/lib/auth";

/** API Route / Server Action：当前请求的登录用户 id（未启用 Auth 时为 null） */
export async function getRouteHandlerUserId(): Promise<string | null> {
  if (!isAuthEnabled()) return null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
