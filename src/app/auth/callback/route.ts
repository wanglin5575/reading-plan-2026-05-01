import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

/**
 * 邮箱确认 / OAuth（Google 等）回调：用 code 换会话并 302 回应用。
 * 必须把 Set-Cookie 写到「即将返回的」redirect Response 上，否则在 Next App Router 里可能出现
 * 换票成功但浏览器未持久化会话、蒙层仍判未登录（老用户二次登录更明显）。
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextRaw = requestUrl.searchParams.get("next") || "/weekly";
  const safePath =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/me";

  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const supabaseUrl = raw ? normalizeSupabaseUrl(raw) : "";
  if (!supabaseUrl || !key) {
    return NextResponse.redirect(new URL("/weekly", request.url));
  }

  if (code) {
    const redirectUrl = new URL(safePath, requestUrl.origin);
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(supabaseUrl, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(new URL("/weekly?auth_error=1", requestUrl.origin));
}
