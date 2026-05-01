import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

/** 邮箱验证链接（如需）在登录后把浏览器带到本站并写入会话 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextRaw = requestUrl.searchParams.get("next") || "/me";
  const safePath =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/me";

  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const url = raw ? normalizeSupabaseUrl(raw) : "";
  if (!url || !key) {
    return NextResponse.redirect(new URL("/me", request.url));
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* ignore */
          }
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safePath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/me?auth_error=1", requestUrl.origin));
}
