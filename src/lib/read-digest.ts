export function normalizeKeyPoints(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const pts = raw.map((x) => String(x).trim()).filter(Boolean);
  if (pts.length !== 3) return null;
  return pts;
}

export function validateReadDigest(one: string | undefined, action: string | undefined, points: string[] | null): boolean {
  return Boolean(one?.trim() && action?.trim() && points && points.length === 3);
}
