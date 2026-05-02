/**
 * 可选：OpenAI 兼容 Chat Completions，一次性产出摘要 + 发布时间 + 作者 + 阅读时长（JSON）。
 * 密钥仅读 process.env，勿使用 NEXT_PUBLIC_ 前缀。
 *
 * 别名：WOLF_API_KEY、WOLF_BASE_URL、WOLF_MODEL（AI_SUMMARY_* 优先）
 */

import { normalizePublishedToIso } from "@/lib/browse-published";

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

/** 从模型输出中抠 JSON（兼容 ```json 围栏） */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const inner = fenced?.[1]?.trim() ?? t;
  try {
    const o = JSON.parse(inner) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    const start = inner.indexOf("{");
    const end = inner.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const o = JSON.parse(inner.slice(start, end + 1)) as unknown;
        return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) return null;
  return n;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** 发布时间统一为 YYYY-MM-DD 或 null */
function parsePublicationYmd(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  const iso = normalizePublishedToIso(s.trim());
  return iso ? iso.slice(0, 10) : null;
}

function parseWorthReading(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "1") return true;
    if (s === "false" || s === "no" || s === "0") return false;
  }
  return null;
}

export type AiArticleEnrichment = {
  summary?: string | null;
  publishedAt?: string | null;
  author?: string | null;
  readingMinutes?: number | null;
  /** 仅随览 browseQualify 流程解析：是否值得打开阅读原文 */
  worthReading?: boolean | null;
  /** 仅当 worth_reading 为 false 时：筛除理由（≤50 字） */
  notWorthReason?: string | null;
};

/** OpenAI 兼容 API 的 usage 字段 */
export type AiChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiEnrichArticleResult = {
  enrichment: AiArticleEnrichment | null;
  usage: AiChatUsage | null;
};

function parseUsage(data: unknown): AiChatUsage | null {
  if (!data || typeof data !== "object") return null;
  const u = (data as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const prompt =
    "prompt_tokens" in u && typeof (u as { prompt_tokens?: unknown }).prompt_tokens === "number"
      ? (u as { prompt_tokens: number }).prompt_tokens
      : 0;
  const completion =
    "completion_tokens" in u && typeof (u as { completion_tokens?: unknown }).completion_tokens === "number"
      ? (u as { completion_tokens: number }).completion_tokens
      : 0;
  const total =
    "total_tokens" in u && typeof (u as { total_tokens?: unknown }).total_tokens === "number"
      ? (u as { total_tokens: number }).total_tokens
      : prompt + completion;
  if (!Number.isFinite(total) || total < 0) return null;
  return {
    promptTokens: Number.isFinite(prompt) ? Math.max(0, Math.round(prompt)) : 0,
    completionTokens: Number.isFinite(completion) ? Math.max(0, Math.round(completion)) : 0,
    totalTokens: Math.max(0, Math.round(total)),
  };
}

/**
 * 调用 AI 生成结构化结果；完全失败（未配置、网络、非 2xx）返回 null，由上层全部降级。
 * 部分字段缺失时仍可合并使用。
 */
export async function enrichArticleWithAi(params: {
  title: string;
  body: string;
  url: string;
  scrapeAuthorHint?: string;
  publishedIsoHint?: string | null;
  /**
   * 随览专用：提示词要求输出 worth_reading，并强化「从正文推断发布时间」。
   * 书库文章分类请勿开启。
   */
  browseQualify?: boolean;
}): Promise<AiEnrichArticleResult> {
  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const model = trimEnv("AI_SUMMARY_MODEL", "WOLF_MODEL");
  if (!base || !key || !model) return { enrichment: null, usage: null };

  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 60000) ||
    12000;
  const defaultOut = params.browseQualify ? 960 : 800;
  const maxTokens = Math.min(
    Math.max(
      parseInt(process.env.AI_SUMMARY_MAX_OUTPUT_TOKENS?.trim() || String(defaultOut), 10) || defaultOut,
      1,
    ),
    2000,
  );

  const bodyText = params.body.replace(/\s+/g, " ").trim().slice(0, maxInput);
  const hintAuthor = params.scrapeAuthorHint?.trim() || "";
  const hintPub = params.publishedIsoHint?.trim()
    ? `页面元数据 / Firecrawl 推测的发布时间（ISO，常与正文不一致，仅作线索）：${params.publishedIsoHint!.trim()}`
    : "页面元数据未提供可靠发布时间。";

  const userContent = `标题：${params.title.slice(0, 400)}
链接：${params.url}
抓取侧作者线索（可能为空或不准）：${hintAuthor || "无"}
${hintPub}

正文节选：
${bodyText || "(正文为空)"}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authMode = (trimEnv("AI_SUMMARY_AUTH") || "bearer")!.toLowerCase();
  if (authMode === "x-api-key" || authMode === "x_api_key") {
    headers["X-API-Key"] = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }

  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.AI_SUMMARY_TIMEOUT_MS?.trim() || "60000", 10) || 60000, 5000),
    120000,
  );

  const systemText = params.browseQualify
    ? `你是阅读策展助手。请根据标题与正文节选，输出且仅输出一个 JSON 对象（不要 Markdown、不要代码围栏），字段如下：
- summary：简体中文一句话概括主旨，严格不超过150个字（含标点）；不要前缀「摘要：」；不要复述 URL。
- published_at：文章首次公开发布日期，YYYY-MM-DD。优先依据正文中的日期、文首 byline、文末署名或转载声明；若与上方「元数据线索」冲突，以更贴近正文事实的为准；无法判断则 null（不要用「今天」搪塞）。
- author：署名作者或机构，简短；无法判断则 null。可参考抓取线索但不要照抄域名或栏目名当作者。
- reading_minutes：通读/听完正文所需的整数分钟数，范围 1～600；无法估计则填 null。
- worth_reading：布尔值。true = 有独立观点、信息增量或完整叙事，值得打开阅读原文；false = 明显为站点首页、栏目聚合、仅列表无正文、失效占位、spam、纯广告导航。
- not_worth_reason：仅当 worth_reading 为 false 时填写，简体中文一句话说明为何不推荐阅读，严格不超过50个字；worth_reading 为 true 时必须为 null。

原则：published_at / author 不确定用 null；worth_reading 宁严勿滥。`
    : `你是阅读元数据助手。请根据标题与正文节选，输出且仅输出一个 JSON 对象（不要 Markdown、不要代码围栏），字段如下：
- summary：简体中文一句话概括主旨，严格不超过150个字（含标点）；不要前缀「摘要：」；不要复述 URL。
- published_at：文章首次公开发布的日期，格式 YYYY-MM-DD；无法从正文或常识推断则填 null（不要用「今天」搪塞）。
- author：文章署名作者或机构，简短；无法判断则填 null。可参考抓取线索但不要照抄明显站点名当作者。
- reading_minutes：通读/听完正文所需的整数分钟数，范围 1～600；无法估计则填 null。

原则：不确定的字段用 null，不要编造日期或作者。`;

  const bodyPayload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
  };

  const jsonMode = trimEnv("AI_SUMMARY_JSON_MODE");
  if (jsonMode !== "0" && jsonMode !== "false") {
    bodyPayload.response_format = { type: "json_object" };
  }

  let res: Response;
  try {
    res = await fetch(chatCompletionsUrl(base), {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { enrichment: null, usage: null };
  }

  let usage: AiChatUsage | null = null;
  let jsonPayload: unknown;
  try {
    jsonPayload = await res.json();
  } catch {
    return { enrichment: null, usage: null };
  }
  usage = parseUsage(jsonPayload);

  if (!res.ok) return { enrichment: null, usage };

  let text = "";
  try {
    const data = jsonPayload as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    text =
      data.choices?.[0]?.message?.content?.trim() ||
      (typeof data.choices?.[0]?.text === "string" ? data.choices[0].text.trim() : "") ||
      "";
  } catch {
    return { enrichment: null, usage };
  }
  if (!text) return { enrichment: null, usage };

  const json = extractJsonObject(text);
  if (!json) return { enrichment: null, usage };

  const summary = strOrNull(json.summary);
  const publishedAt = parsePublicationYmd(strOrNull(json.published_at));
  const author = strOrNull(json.author)?.slice(0, 120) ?? null;
  const rm = numOrNull(json.reading_minutes);
  const readingMinutes =
    rm != null && rm >= 1 && rm <= 600 ? Math.round(rm) : null;
  const worthReading = params.browseQualify ? parseWorthReading(json.worth_reading) : null;
  let notWorthReason: string | null = null;
  if (params.browseQualify && worthReading === false) {
    notWorthReason = strOrNull(json.not_worth_reason)?.replace(/\s+/g, " ").trim().slice(0, 50) || null;
  }

  return {
    enrichment: {
      summary: summary ?? null,
      publishedAt,
      author,
      readingMinutes,
      worthReading,
      notWorthReason,
    },
    usage,
  };
}
