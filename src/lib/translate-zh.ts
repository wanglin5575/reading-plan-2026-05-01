import type { BrowseHit } from "./types";

/**
 * 翻译优先级：
 * 1. 若已配置与 `ai-summary.ts` 相同的 OpenAI 兼容网关（`AI_SUMMARY_*` 或 `WOLF_*`），优先走 Chat Completions（可对接 WolfAI）。
 * 2. 否则依次 MyMemory → Lingva → Google gtx，失败则保留原文。
 *
 * 禁用模型翻译：环境变量 `AI_TRANSLATE_VIA_LLM=0`
 */

const FETCH_MS = 12000;

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

function chatCompletionsUrl(baseRaw: string): string {
  const b = baseRaw.replace(/\/$/, "");
  if (/\/v1$/i.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

/** 与 enrichArticleWithAi 同源配置：WolfAI / 自建 OpenAI 兼容网关 */
async function translateWithOpenAiCompatibleGateway(text: string): Promise<string | null> {
  const off = process.env.AI_TRANSLATE_VIA_LLM?.trim().toLowerCase();
  if (off === "0" || off === "false" || off === "no") return null;

  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const model = trimEnv("AI_TRANSLATE_MODEL", "AI_SUMMARY_MODEL", "WOLF_MODEL");
  if (!base || !key || !model) return null;

  const authMode = (trimEnv("AI_SUMMARY_AUTH") || "bearer").toLowerCase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authMode === "x-api-key" || authMode === "x_api_key") {
    headers["X-API-Key"] = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }

  const maxOut = Math.min(
    Math.max(parseInt(process.env.AI_TRANSLATE_MAX_TOKENS?.trim() || "1024", 10) || 1024, 256),
    4096,
  );
  const timeoutRaw =
    trimEnv("AI_TRANSLATE_TIMEOUT_MS", "AI_SUMMARY_TIMEOUT_MS") || "60000";
  const timeoutMs = Math.min(Math.max(parseInt(timeoutRaw, 10) || 60000, 5000), 120000);

  const q = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!q) return null;

  const bodyPayload = {
    model,
    temperature: 0.2,
    max_tokens: maxOut,
    messages: [
      {
        role: "system" as const,
        content:
          "你是翻译助手。将用户给出的文本翻译成简体中文。只输出译文本身，不要前缀、不要解释、不要使用 Markdown 代码围栏。",
      },
      { role: "user" as const, content: q },
    ],
  };

  let res: Response;
  try {
    res = await fetch(chatCompletionsUrl(base), {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const d = data as { choices?: Array<{ message?: { content?: string } }> };
  const raw = d.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^[`"'「『\s]+|[`"'」』\s]+$/g, "").trim();
  return cleaned.length ? cleaned : null;
}

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

  const llm = await translateWithOpenAiCompatibleGateway(trimmed);
  if (llm) return llm;

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
