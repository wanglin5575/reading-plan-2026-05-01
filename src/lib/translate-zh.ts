import type { BrowseHit } from "./types";

/** 与正文分类摘要一致：非中文依次尝试 MyMemory → Lingva 镜像 → Google 翻译（gtx），均失败则保留原文 */

const FETCH_MS = 12000;

function isPrimarilyChinese(text: string): boolean {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (cjk === 0 && latin === 0) return true;
  return cjk > latin * 2;
}

async function translateWithMyMemory(text: string): Promise<string | null> {
  try {
    const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text.slice(0, 1200),
    )}&langpair=en|zh-CN`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    if (data.responseStatus && data.responseStatus !== 200) return null;
    const translated = data.responseData?.translatedText?.trim();
    if (!translated || translated === text) return null;
    return translated;
  } catch {
    return null;
  }
}

/** Lingva 公共实例：路径长度有限，截断为较短段落 */
async function translateWithLingva(text: string): Promise<string | null> {
  const q = text.slice(0, 450);
  const encoded = encodeURIComponent(q);
  const bases = ["https://lingva.ml", "https://translate.plausibility.cloud"];

  for (const base of bases) {
    for (const target of ["zh", "zh-CN"] as const) {
      try {
        const url = `${base}/api/v1/en/${target}/${encoded}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
        if (!res.ok) continue;
        const data = (await res.json()) as { translation?: string };
        const t = data.translation?.trim();
        if (t && t !== q) return t;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

/** 无密钥时常作为兜底；接口非官方，可能变更 */
async function translateWithGoogleGtx(text: string): Promise<string | null> {
  try {
    const q = text.slice(0, 1200);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    let out = "";
    for (const chunk of data[0] as unknown[]) {
      if (Array.isArray(chunk) && typeof chunk[0] === "string") out += chunk[0];
    }
    const t = out.trim();
    return t && t !== q ? t : null;
  } catch {
    return null;
  }
}

export async function translateToChinese(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (isPrimarilyChinese(trimmed)) return trimmed;

  const my = await translateWithMyMemory(trimmed);
  if (my) return my;
  const ling = await translateWithLingva(trimmed);
  if (ling) return ling;
  const g = await translateWithGoogleGtx(trimmed);
  if (g) return g;
  return trimmed;
}

/** 随览卡片：摘要合并译中文；英文为主的标题另译一行 titleZh */
export async function translateBrowseHitsToChinese(hits: BrowseHit[]): Promise<BrowseHit[]> {
  return Promise.all(
    hits.map(async (h) => {
      let next: BrowseHit = { ...h };
      const blob = (h.summary || h.excerpt || h.description).trim();
      if (blob) {
        const zh = await translateToChinese(blob);
        next = { ...next, summary: zh, excerpt: zh, description: zh };
      }
      const title = h.title.trim();
      if (title && !isPrimarilyChinese(title)) {
        const t = (await translateToChinese(title)).trim();
        if (t && t !== title) next = { ...next, titleZh: t.slice(0, 400) };
      }
      return next;
    }),
  );
}
