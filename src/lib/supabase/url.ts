/**
 * 云端 Project URL 只能是「根」：`https://<ref>.supabase.co`。
 * 若误填 `.../auth/v1`、`.../rest/v1`，SDK 会再拼 `/auth/v1`，变成
 * `.../auth/auth/v1` 等非法路径，网关常返回「Invalid path specified in request URL」。
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    const hasExtraPath = u.pathname !== "" && u.pathname !== "/";
    if (hasExtraPath && typeof console !== "undefined" && console.warn) {
      console.warn(
        `[Supabase] NEXT_PUBLIC_SUPABASE_URL 不应含路径（当前为 ${trimmed}），已改用 ${u.origin}。请在环境变量中只填 Project URL 根地址。`,
      );
    }
    return u.origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}
