/**
 * 可选：OpenAI 兼容 Chat Completions，一次性产出摘要 + 发布时间 + 作者 + 阅读时长（JSON）。
 * 密钥仅读 process.env，勿使用 NEXT_PUBLIC_ 前缀。
 *
 * 别名：WOLF_API_KEY、WOLF_BASE_URL、WOLF_MODEL（AI_SUMMARY_* 优先）
 */

import { normalizePublishedToIso } from "@/lib/browse-published";
import { enrichArticleInputHash, sha256Hex } from "@/lib/ai-cache-hash";
import {
  getAiGenerationCache,
  getAiGenerationCacheByUrlKey,
  isDatabaseConfigured,
  upsertAiGenerationCache,
} from "@/lib/db";
import { normalizeArticleUrlKey } from "@/lib/url-key";
import { fetchAiChatCompletions, type AiChatUsage } from "@/lib/ai-chat";
import { stripMarkdownToPlainText } from "@/lib/strip-markdown";

export { parseOpenAiCompatibleUsage, type AiChatUsage } from "@/lib/ai-chat";

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
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

/**
 * 兜底：部分 OpenAI 兼容网关（如 wolfai.top 包装的 claude）会无视 response_format
 * 与「只输出 JSON」的指令，直接返回带 Markdown 的寒暄式正文。此时不应整体降级为原文节选，
 * 而是把这段正文清洗成一句可用的中文摘要，保证卡片显示的是 AI 内容而非抓取原文。
 */
function salvageSummaryFromProse(raw: string): string | null {
  let t = stripMarkdownToPlainText(raw).replace(/\s+/g, " ").trim();
  if (!t) return null;
  // 去掉开头的寒暄/评价句（如「这篇文章分享的内容很有意思！」「简单解读一下：」）
  t = t.replace(
    /^[^。！？!?\n]{0,48}?(很有意思|有意思|很有价值|有价值|很棒|不错|挺好|很好|解读一下|简单解读|简单说|来看看|分享一下|介绍一下|总结一下|梳理一下|拆解一下)[^。！？!?\n]*[。！？!?：:，,]\s*/u,
    "",
  );
  // 去掉开头的标签式引导词
  t = t.replace(/^(核心要点|核心内容|核心亮点|核心洞察|要点|背景|概述|摘要)[^：:\n]{0,10}?[：:]\s*/u, "");
  t = t.trim();
  return t.length >= 6 ? t : stripMarkdownToPlainText(raw).replace(/\s+/g, " ").trim() || null;
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

function parseCachedEnrichment(
  row: Record<string, unknown>,
  browseQualify: boolean,
): AiArticleEnrichment | null {
  const raw = row.enrichment;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const j = raw as Record<string, unknown>;
  const summary = strOrNull(j.summary);
  const publishedAt = parsePublicationYmd(strOrNull(j.publishedAt));
  const author = strOrNull(j.author)?.slice(0, 120) ?? null;
  const rm = numOrNull(j.readingMinutes);
  const readingMinutes =
    rm != null && rm >= 1 && rm <= 600 ? Math.round(rm) : null;
  const worthReading = browseQualify ? parseWorthReading(j.worthReading) : null;
  let notWorthReason: string | null = null;
  if (browseQualify && worthReading === false) {
    notWorthReason = strOrNull(j.notWorthReason)?.replace(/\s+/g, " ").trim().slice(0, 50) || null;
  }
  const hasSummary = Boolean(summary?.trim());
  if (!hasSummary && !(browseQualify && worthReading === false)) return null;
  return {
    summary: summary ?? null,
    publishedAt,
    author,
    readingMinutes,
    worthReading,
    notWorthReason,
  };
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

export type AiEnrichArticleResult = {
  enrichment: AiArticleEnrichment | null;
  usage: AiChatUsage | null;
};

/**
 * 调用 AI 生成结构化结果；完全失败（未配置、网络、非 2xx）返回 null，由上层全部降级。
 * 部分字段缺失时仍可合并使用。
 */
type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function enrichArticleWithAi(params: {
  title: string;
  body: string;
  url: string;
  scrapeAuthorHint?: string;
  publishedIsoHint?: string | null;
  /**
   * 视频/图集页 Firecrawl 首屏截图（常为 data:image/...;base64,...）。
   * 若同时配置 AI_SUMMARY_VISION_MODEL，将走多模态消息以理解画面；否则仅使用正文。
   */
  screenshotDataUrl?: string | null;
  /**
   * 随览专用：提示词要求输出 worth_reading，并强化「从正文推断发布时间」。
   * 书库文章分类请勿开启。
   */
  browseQualify?: boolean;
  /** 用于云端缓存分桶；缺省为匿名桶 */
  cacheUserId?: string | null;
}): Promise<AiEnrichArticleResult> {
  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const textModel = trimEnv("AI_SUMMARY_MODEL", "WOLF_MODEL");
  const visionModel = trimEnv("AI_SUMMARY_VISION_MODEL");
  if (!base || !key || !textModel) return { enrichment: null, usage: null };

  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 60000) ||
    12000;
  const defaultOut = params.browseQualify ? 960 : 2400;
  const maxTokens = Math.min(
    Math.max(
      parseInt(process.env.AI_SUMMARY_MAX_OUTPUT_TOKENS?.trim() || String(defaultOut), 10) || defaultOut,
      1,
    ),
    4096,
  );

  const bodyText = params.body.replace(/\s+/g, " ").trim().slice(0, maxInput);
  const hintAuthor = params.scrapeAuthorHint?.trim() || "";
  const publishedIsoHint = params.publishedIsoHint?.trim() ?? "";
  const shotRaw = params.screenshotDataUrl?.trim() ?? "";
  const maxShot =
    Math.min(parseInt(process.env.AI_SUMMARY_SCREENSHOT_MAX_CHARS?.trim() || "400000", 10) || 400000, 900000) ||
    400000;
  const screenshotOk =
    Boolean(visionModel) &&
    shotRaw.startsWith("data:image") &&
    shotRaw.length >= 80 &&
    shotRaw.length <= maxShot;
  const visionFingerprint = screenshotOk ? sha256Hex(shotRaw.slice(0, 16384)) : "";
  const model = screenshotOk && visionModel ? visionModel : textModel;

  const kind = params.browseQualify ? "enrich_article_browse_v1" : "enrich_article_book_v1";
  const inputHash = enrichArticleInputHash({
    title: params.title.slice(0, 400),
    url: params.url,
    bodyText,
    browseQualify: Boolean(params.browseQualify),
    scrapeAuthorHint: hintAuthor,
    publishedIsoHint,
    visionFingerprint,
  });

  const urlKey = normalizeArticleUrlKey(params.url);

  if (isDatabaseConfigured()) {
    const cached = await getAiGenerationCache(params.cacheUserId ?? null, kind, inputHash);
    if (cached) {
      const enrichment = parseCachedEnrichment(cached, Boolean(params.browseQualify));
      if (enrichment) return { enrichment, usage: null };
    }
    if (urlKey) {
      const byUrl = await getAiGenerationCacheByUrlKey(kind, urlKey);
      if (byUrl) {
        const enrichment = parseCachedEnrichment(byUrl, Boolean(params.browseQualify));
        if (enrichment) return { enrichment, usage: null };
      }
    }
  }

  const hintPub = params.publishedIsoHint?.trim()
    ? `页面元数据 / Firecrawl 推测的发布时间（ISO，常与正文不一致，仅作线索）：${params.publishedIsoHint!.trim()}`
    : "页面元数据未提供可靠发布时间。";

  const visionNote = screenshotOk
    ? "另附一张页面首屏截图（视频约前十余秒加载后的画面或图集首图），请结合画面与下方文字理解主题。"
    : shotRaw && !visionModel
      ? "抓取侧曾截取首屏画面，但当前未配置 AI_SUMMARY_VISION_MODEL，请仅依据文字（含字幕/描述摘录）推断。"
      : "";

  const userText = `标题：${params.title.slice(0, 400)}
链接：${params.url}
抓取侧作者线索（可能为空或不准）：${hintAuthor || "无"}
${hintPub}
${visionNote ? `${visionNote}\n` : ""}
正文节选：
${bodyText || "(正文为空)"}`;

  const authMode = (trimEnv("AI_SUMMARY_AUTH") || "bearer")!.toLowerCase();

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

原则：published_at / author 不确定用 null；worth_reading 宁严勿滥。${
        screenshotOk ? " 若提供截图，请把画面中的关键文字、场景与视频主题纳入 summary。" : ""
      }`
    : `你是阅读元数据助手。请根据标题与正文节选，输出且仅输出一个 JSON 对象（不要 Markdown、不要代码围栏），字段如下：
- summary：简体中文概括主旨与主要内容，讲清要点、力求完整；不设硬性字数上限，不要为压缩字数而牺牲要点；不要前缀「摘要：」；不要复述 URL。
- published_at：文章首次公开发布的日期，格式 YYYY-MM-DD；无法从正文或常识推断则填 null（不要用「今天」搪塞）。
- author：文章署名作者或机构，简短；无法判断则填 null。可参考抓取线索但不要照抄明显站点名当作者。
- reading_minutes：通读/听完正文所需的整数分钟数，范围 1～600；无法估计则填 null。

原则：不确定的字段用 null，不要编造日期或作者。${screenshotOk ? " 若提供截图，请结合画面理解多媒体内容并写入 summary。" : ""}`;

  const userMessageContent: string | VisionContentPart[] = screenshotOk
    ? [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: shotRaw } },
      ]
    : userText;

  const bodyPayload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      {
        role: "system",
        content: `${systemText}\n\n务必：直接输出结果，不要任何寒暄、评价或开场白（如「这篇文章很有意思」「简单解读一下」）；尽量只返回 JSON 对象本身，不要额外说明文字。`,
      },
      { role: "user", content: userMessageContent },
    ],
  };

  const jsonMode = trimEnv("AI_SUMMARY_JSON_MODE");
  if (jsonMode !== "0" && jsonMode !== "false") {
    bodyPayload.response_format = { type: "json_object" };
  }

  const aiResult = await fetchAiChatCompletions({
    base,
    key,
    authMode,
    bodyPayload,
    timeoutMs,
    label: params.browseQualify ? "browse_enrich" : "article_enrich",
    retryWithoutResponseFormat: true,
  });
  const usage = aiResult.usage;
  if (!aiResult.ok) return { enrichment: null, usage };
  const jsonPayload = aiResult.jsonPayload;

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

  let summary: string | null;
  let publishedAt: string | null;
  let author: string | null;
  let readingMinutes: number | null;
  let worthReading: boolean | null;
  let notWorthReason: string | null = null;

  if (json) {
    summary = strOrNull(json.summary);
    publishedAt = parsePublicationYmd(strOrNull(json.published_at));
    author = strOrNull(json.author)?.slice(0, 120) ?? null;
    const rm = numOrNull(json.reading_minutes);
    readingMinutes = rm != null && rm >= 1 && rm <= 600 ? Math.round(rm) : null;
    worthReading = params.browseQualify ? parseWorthReading(json.worth_reading) : null;
    if (params.browseQualify && worthReading === false) {
      notWorthReason = strOrNull(json.not_worth_reason)?.replace(/\s+/g, " ").trim().slice(0, 50) || null;
    }
  } else {
    // 网关返回了非 JSON 的纯文本：兜底salvage 成摘要，避免整体降级为原文节选。
    summary = salvageSummaryFromProse(text);
    if (!summary) {
      console.warn("[ai-summary] non_json_unsalvageable", {
        label: params.browseQualify ? "browse_enrich" : "article_enrich",
        bodyPreview: text.slice(0, 200),
      });
      return { enrichment: null, usage };
    }
    console.warn("[ai-summary] non_json_salvaged_summary", {
      label: params.browseQualify ? "browse_enrich" : "article_enrich",
    });
    publishedAt = null;
    author = null;
    readingMinutes = null;
    // 无法判断是否值得阅读时，默认保留（true），避免把正常内容误杀为「不推荐」。
    worthReading = params.browseQualify ? true : null;
  }

  const enrichment: AiArticleEnrichment = {
    summary: summary ?? null,
    publishedAt,
    author,
    readingMinutes,
    worthReading,
    notWorthReason,
  };

  if (isDatabaseConfigured()) {
    void upsertAiGenerationCache(
      params.cacheUserId ?? null,
      kind,
      inputHash,
      { enrichment },
      usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
      urlKey || null,
    );
  }

  return {
    enrichment,
    usage,
  };
}
