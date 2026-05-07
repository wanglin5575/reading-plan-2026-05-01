/** 恰好 3 个槽位（可为空串），用于持久化 read_key_points */
export type KeyPointsTriple = [string, string, string];

export function normalizeKeyPointsSlots(raw: unknown): KeyPointsTriple {
  if (!Array.isArray(raw)) return ["", "", ""];
  const a = raw.map((x) => String(x ?? "").trim());
  return [a[0] ?? "", a[1] ?? "", a[2] ?? ""];
}

/** 标记已读 / 随览加入已读：仅要求一句话总结与行动项；重要观点三条均可空 */
export function validateReadDigest(one: string | undefined, action: string | undefined): boolean {
  return Boolean(one?.trim() && action?.trim());
}

/** 兼容旧逻辑：三条均非空时返回数组，否则 null（新代码请用 normalizeKeyPointsSlots） */
export function normalizeKeyPoints(raw: unknown): string[] | null {
  const [a, b, c] = normalizeKeyPointsSlots(raw);
  if (!a || !b || !c) return null;
  return [a, b, c];
}
