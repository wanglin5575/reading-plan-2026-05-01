/**
 * 随览：仅保留以中文或英文为主的条目，过滤日文、韩文、阿拉伯文等占主导的页面。
 */

const RE_KANA = /[\u3040-\u309f\u30a0-\u30ff]/g;
const RE_HANGUL = /[\uac00-\ud7af]/g;
const RE_CYRILLIC = /[\u0400-\u04ff]/g;
const RE_ARABIC = /[\u0600-\u06ff]/g;
const RE_THAI = /[\u0e00-\u0e7f]/g;
const RE_DEVANAGARI = /[\u0900-\u097f]/g;
const RE_CJK = /[\u4e00-\u9fff]/g;
const RE_LATIN = /[a-zA-Z]/g;

function letterishScore(raw: string): { zhEn: number; other: number; kana: number; hangul: number } {
  const cjk = (raw.match(RE_CJK) || []).length;
  const latin = (raw.match(RE_LATIN) || []).length;
  const kana = (raw.match(RE_KANA) || []).length;
  const hangul = (raw.match(RE_HANGUL) || []).length;
  const cyr = (raw.match(RE_CYRILLIC) || []).length;
  const arab = (raw.match(RE_ARABIC) || []).length;
  const thai = (raw.match(RE_THAI) || []).length;
  const dev = (raw.match(RE_DEVANAGARI) || []).length;
  const zhEn = cjk + latin;
  const other = kana + hangul + cyr + arab + thai + dev;
  return { zhEn, other, kana, hangul };
}

/** 标题 + 摘要等合并文本是否以中文或英文为主（允许中英混合） */
export function isPrimarilyChineseOrEnglish(blob: string): boolean {
  const raw = blob.replace(/\s+/g, " ").trim();
  if (raw.length < 10) return true;

  const { zhEn, other, kana, hangul } = letterishScore(raw);

  // 明显的日文主导（假名远多于汉字）
  if (kana >= 6 && kana > (raw.match(RE_CJK) || []).length * 1.2) return false;
  // 韩文主导
  if (hangul >= 6 && hangul > (raw.match(RE_CJK) || []).length * 1.2) return false;

  // 西里尔 / 阿拉伯 / 泰文 / 天城文占比较高且中英很少
  if (zhEn < 8 && other >= 10) return false;
  if (zhEn > 0 && other / (zhEn + other) > 0.55 && zhEn < 12) return false;

  return true;
}

export function browseHitLanguageBlob(hit: {
  title: string;
  description?: string;
  summary?: string;
  excerpt?: string;
  fullMarkdownForAi?: string;
}): string {
  return [hit.title, hit.description, hit.summary, hit.excerpt, hit.fullMarkdownForAi]
    .filter(Boolean)
    .join("\n");
}
