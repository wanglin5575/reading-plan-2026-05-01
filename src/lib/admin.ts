/** 后台管理员邮箱：可通过 ADMIN_EMAILS 追加逗号分隔列表 */

const DEFAULT_ADMIN_EMAIL = "vienna.wwl@gmail.com";

/**
 * 用于管理员白名单比对：trim + 小写；Gmail / Googlemail 忽略 local 中的「.」与「+标签」，
 * 避免登录邮箱与配置的 vienna.wwl@gmail.com 等形式不一致导致无法识别管理员。
 */
export function normalizeEmailForAdminMatch(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
  }
  return `${local}@${domain}`;
}

export function adminEmailSet(): Set<string> {
  const fromEnv =
    process.env.ADMIN_EMAILS?.split(",").map((s) => normalizeEmailForAdminMatch(s)).filter(Boolean) ?? [];
  const set = new Set<string>([normalizeEmailForAdminMatch(DEFAULT_ADMIN_EMAIL), ...fromEnv]);
  return set;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return adminEmailSet().has(normalizeEmailForAdminMatch(email));
}
