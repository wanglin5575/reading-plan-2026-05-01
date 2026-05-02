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
    return "邮箱尚未验证：请打开注册邮件中的确认链接；也可在登录区点「重发验证邮件」后再试。";
  }
  if (
    code === "invalid_credentials" ||
    /invalid login credentials/i.test(raw) ||
    /invalid credentials/i.test(raw)
  ) {
    return "登录失败：请核对邮箱与密码。若已注册但未完成邮箱验证，可先点「重发验证邮件」再查收邮箱并完成链接验证。";
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return "该邮箱已注册，请直接登录或使用其他邮箱。";
  }
  if (
    /rate limit exceeded/i.test(raw) ||
    code === "over_request_rate_limit" ||
    code === "too_many_requests"
  ) {
    return "发送邮件过于频繁（已达 Supabase 限额）：请稍后再试，或在 Supabase 控制台配置自定义 SMTP 提高额度；开发阶段可减少「注册/重发验证邮件/重置密码」次数。";
  }
  return raw;
}
