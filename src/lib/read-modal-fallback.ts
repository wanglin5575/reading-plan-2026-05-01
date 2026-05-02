/** 客户端与服务端共用的阅读弹窗节选降级（≤500 字） */

export const READ_MODAL_MAX_CHARS = 500;

export function clampZhBody(s: string, max = READ_MODAL_MAX_CHARS): string {
  const t = s.replace(/\s+/g, " ").trim();
  const chars = Array.from(t);
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("") + "…";
}

export function fallbackReadModalBody(sourceText: string): string {
  const t = sourceText.replace(/\s+/g, " ").trim();
  return clampZhBody(t || "暂无可用摘要，请点击下方查看原文。");
}
