import { createClient, type User } from "@supabase/supabase-js";

export type AuthUserLite = {
  id: string;
  email: string;
  createdAt: string;
};

function createdAtIso(u: User): string {
  const raw = u.created_at;
  return typeof raw === "string" ? raw : raw ? String(raw) : new Date().toISOString();
}

/** 主邮箱 + OAuth identity 里可能出现的 email */
function primaryEmailFromAuthUser(u: User): string {
  const direct = u.email?.trim();
  if (direct) return direct;
  for (const id of u.identities ?? []) {
    const meta = id.identity_data;
    if (meta && typeof meta === "object" && "email" in meta) {
      const cand = String((meta as { email?: unknown }).email ?? "").trim();
      if (cand) return cand;
    }
  }
  return "";
}

function toAuthUserLite(u: User): AuthUserLite | null {
  if (!u.id) return null;
  const email = primaryEmailFromAuthUser(u);
  return { id: u.id, email: email || "(no-email)", createdAt: createdAtIso(u) };
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 需要环境变量 SUPABASE_SERVICE_ROLE_KEY（仅服务端使用）。
 * 未配置时返回空数组，后台将主要依赖 app_user_registry。
 */
export async function listAllSupabaseAuthUsers(): Promise<AuthUserLite[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const out: AuthUserLite[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[admin-users] listUsers:", error.message);
      break;
    }
    const users = data.users ?? [];
    for (const u of users) {
      const lite = toAuthUserLite(u);
      if (lite) out.push(lite);
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return out;
}

/**
 * 按 user id 逐个解析 Auth 用户（补全 listUsers 未覆盖或曾失败的 id）。
 * 用于管理后台将会员用量里的 user_id 对齐到真实邮箱。
 */
export async function fetchSupabaseAuthUsersByIds(rawIds: string[]): Promise<AuthUserLite[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const ids = [...new Set(rawIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const batchSize = 8;
  const out: AuthUserLite[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        const { data, error } = await supabase.auth.admin.getUserById(id);
        if (error || !data.user) {
          if (error) console.warn("[admin-users] getUserById:", id.slice(0, 8), error.message);
          return null;
        }
        return toAuthUserLite(data.user);
      }),
    );
    for (const u of chunkResults) {
      if (u) out.push(u);
    }
  }
  return out;
}
