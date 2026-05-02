/**
 * 纯文本统计（无 DB / 无翻译），可被客户端组件安全引用。
 */

export function detectLanguage(text: string): "zh" | "en" | "mixed" {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (cjk === 0 && latin === 0) return "mixed";
  if (cjk > latin * 2) return "zh";
  if (latin > cjk * 2) return "en";
  return "mixed";
}

export function countChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

export function countWords(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

export function estimateMinutes(
  charCount: number,
  wordCount: number,
  language: "zh" | "en" | "mixed",
): number {
  if (language === "zh") return Math.max(1, Math.round(charCount / 350));
  if (language === "en") return Math.max(1, Math.round(wordCount / 220));
  return Math.max(1, Math.round((charCount / 350 + wordCount / 220) / 2));
}
