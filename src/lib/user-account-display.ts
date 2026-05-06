/**
 * 管理后台 / token 用量表中「账号」列的展示名（覆盖邮箱或 UID）。
 * 合并顺序：内置表 ← 环境变量 JSON（后者覆盖同名 uid）。
 */

const BUILTIN_ACCOUNT_LABEL_BY_USER_ID: Record<string, string> = {
  "7f9410c8-e00e-4993-964f-9fe65fc0a460": "wangsheng",
};

/**
 * `READING_PLAN_ACCOUNT_DISPLAY_LABELS`：JSON 对象，键为 user id，值为展示名。
 * 例：{"7f9410c8-e00e-4993-964f-9fe65fc0a460":"wangsheng"}
 */
export function loadAccountDisplayLabelMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(BUILTIN_ACCOUNT_LABEL_BY_USER_ID)) {
    const id = k.trim();
    const label = v.trim();
    if (id && label) m.set(id, label);
  }
  const raw = process.env.READING_PLAN_ACCOUNT_DISPLAY_LABELS?.trim();
  if (!raw) return m;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return m;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const id = k.trim();
      const label = String(v ?? "").trim();
      if (id && label) m.set(id, label);
    }
  } catch {
    /* 配置错误时忽略，仅用内置表 */
  }
  return m;
}

export function accountColumnLabel(userId: string, baseLabel: string, map: Map<string, string>): string {
  const hit = map.get(userId.trim());
  return hit ?? baseLabel;
}
