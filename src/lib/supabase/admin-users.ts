import { createClient } from "@supabase/supabase-js";

export type AuthUserLite = {
  id: string;
  email: string;
  createdAt: string;
};

/**
 * 需要环境变量 SUPABASE_SERVICE_ROLE_KEY（仅服务端使用）。
 * 未配置时返回空数组，后台将主要依赖 app_user_registry。
 */
export async function listAllSupabaseAuthUsers(): Promise<AuthUserLite[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return [];

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const out: AuthUserLite[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[admin-users] listUsers:", error.message);
      return out;
    }
    const users = data.users ?? [];
    for (const u of users) {
      const email = u.email?.trim() || "";
      if (!u.id) continue;
      const createdAt =
        typeof u.created_at === "string" ? u.created_at : u.created_at ? String(u.created_at) : new Date().toISOString();
      out.push({ id: u.id, email: email || "(no-email)", createdAt });
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return out;
}
