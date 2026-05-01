/** 是否已配置 Supabase Auth（与 Postgres 可同时使用） */
export function isAuthEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

function authCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

/** 登录/注册 UI：常见英文错误转中文说明 */
export function formatSupabaseAuthMessage(err: unknown): string {
  if (!(err instanceof Error)) return "操作失败";
  const code = authCode(err);
  const raw = err.message;

  if (code === "email_not_confirmed" || code === "provider_email_needs_verification") {
    return "邮箱尚未验证：请打开注册邮件中的链接完成确认，再回到此处登录。";
  }
  if (
    code === "invalid_credentials" ||
    /invalid login credentials/i.test(raw) ||
    /invalid credentials/i.test(raw)
  ) {
    return "登录失败：请核对邮箱与密码。若已注册但未完成邮箱验证，可先点下面「重发验证邮件」再查收邮箱。";
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return "该邮箱已注册，请直接登录或使用其他邮箱。";
  }

  return raw;
}
