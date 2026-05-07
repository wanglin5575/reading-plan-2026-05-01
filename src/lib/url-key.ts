/** 用于跨入口匹配「同一链接」的缓存键（协议 + 主机小写去 www + 路径去尾斜杠 + 查询串） */
export function normalizeArticleUrlKey(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return s.toLowerCase();
  }
}
