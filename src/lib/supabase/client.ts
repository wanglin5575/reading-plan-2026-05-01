import { createBrowserClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

export function createBrowserSupabaseClient() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const url = raw ? normalizeSupabaseUrl(raw) : "";
  if (!url || !key) {
    throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (url.includes("/auth/") || url.includes("/rest/")) {
    console.warn(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL 应只填项目根地址（如 https://xxx.supabase.co），不要带 /auth/v1 或 /rest/v1。",
    );
  }
  return createBrowserClient(url, key);
}
