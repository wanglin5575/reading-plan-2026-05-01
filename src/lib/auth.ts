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
    return "邮箱尚未验证：请使用注册后收到的 6 位验证码，或打开邮件中的确认链接；仍可在注册页用「重新发送验证码」。";
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
  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    /invalid otp/i.test(raw) ||
    /token.*invalid/i.test(raw)
  ) {
    return "验证码无效或已过期，请点击「重新发送验证码」后再试。";
  }

  return raw;
}
