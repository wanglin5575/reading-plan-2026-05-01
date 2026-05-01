import { isAuthEnabled } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getServerAuthUser() {
  if (!isAuthEnabled()) return null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}
