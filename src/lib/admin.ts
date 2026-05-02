/** 后台管理员邮箱：可通过 ADMIN_EMAILS 追加逗号分隔列表 */

const DEFAULT_ADMIN_EMAIL = "vienna.wwl@gmail.com";

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function adminEmailSet(): Set<string> {
  const fromEnv = process.env.ADMIN_EMAILS?.split(",").map((s) => normalizeEmail(s)).filter(Boolean) ?? [];
  const set = new Set<string>([normalizeEmail(DEFAULT_ADMIN_EMAIL), ...fromEnv]);
  return set;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return adminEmailSet().has(normalizeEmail(email));
}
