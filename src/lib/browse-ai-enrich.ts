import { enrichArticleWithAi } from "@/lib/ai-summary";
import { normalizePublishedToIso } from "@/lib/browse-published";
import type { BrowseHit } from "@/lib/types";

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** 去掉仅供服务端 WolfAI 使用的字段，避免 JSON 响应过大 */
export function stripBrowseHitServerFields<T extends BrowseHit>(hit: T): Omit<T, "fullMarkdownForAi"> {
  const { fullMarkdownForAi: _, ...rest } = hit;
  return rest as Omit<T, "fullMarkdownForAi">;
}

/**
 * 长文：头尾各取一段，避免单截前 12k 丢掉文末日期/署名区。
 * 与 AI_SUMMARY_MAX_INPUT_CHARS 对齐的预算由调用方传入（默认 12000）。
 */
export function composeBodyForBrowseAi(
  fullMarkdown: string,
  fallback: string,
  maxChars: number,
): string {
  const t = fullMarkdown.replace(/\s+/g, " ").trim();
  if (!t) return fallback.replace(/\s+/g, " ").trim().slice(0, maxChars);
  if (t.length <= maxChars) return t;
  const head = Math.floor(maxChars * 0.62);
  const tail = maxChars - head - 12;
  return `${t.slice(0, head)} … ${t.slice(-Math.max(0, tail))}`;
}

function shouldFilterLowValue(): boolean {
  const v = process.env.BROWSE_AI_WORTH_FILTER?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

/**
 * 随览：在 Firecrawl 已有标题/正文节选/元数据提示后，用与「书库文章」相同的 WolfAI（OpenAI 兼容）接口
 * 生成简体中文摘要，并尽量判断发布时间、署名作者、阅读时长；可选筛掉「不值得读」的条目。
 *
 * 关闭：`BROWSE_ENRICH_VIA_LLM=0`（或 false/no）
 * 不根据 worth_reading 筛掉条目：`BROWSE_AI_WORTH_FILTER=0`
 * 需配置：`WOLF_*` 或 `AI_SUMMARY_*`（与 `ai-summary.ts` 一致）
 */
export async function enrichBrowseHitsWithAi(hits: BrowseHit[]): Promise<BrowseHit[]> {
  const off = process.env.BROWSE_ENRICH_VIA_LLM?.trim().toLowerCase();
  if (off === "0" || off === "false" || off === "no") return hits;

  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const model = trimEnv("AI_SUMMARY_MODEL", "WOLF_MODEL");
  if (!base || !key || !model) return hits;

  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 60000) || 12000;
  const filterWorth = shouldFilterLowValue();

  const out: BrowseHit[] = [];
  for (const h of hits) {
    const bodyFromScrape = h.fullMarkdownForAi?.trim() ?? "";
    const fallbackBlob = [h.excerpt, h.summary, h.description].filter(Boolean).join("\n").trim();
    const body = composeBodyForBrowseAi(bodyFromScrape, fallbackBlob, maxInput);

    const { enrichment } = await enrichArticleWithAi({
      title: h.title,
      body,
      url: h.url,
      scrapeAuthorHint: h.author ?? undefined,
      publishedIsoHint: h.publishedTime ?? undefined,
      browseQualify: true,
    });

    if (!enrichment?.summary?.trim()) {
      out.push(h);
      continue;
    }

    if (
      filterWorth &&
      enrichment.worthReading === false
    ) {
      continue;
    }

    const summaryZh = enrichment.summary.trim();
    let publishedTime = h.publishedTime ?? null;
    if (enrichment.publishedAt?.trim()) {
      const iso = normalizePublishedToIso(enrichment.publishedAt.trim());
      if (iso) publishedTime = iso;
    }

    out.push({
      ...h,
      summary: summaryZh,
      excerpt: summaryZh,
      description: summaryZh,
      publishedTime,
      author: enrichment.author?.trim() ? enrichment.author : h.author,
      estimatedMinutes:
        enrichment.readingMinutes != null && enrichment.readingMinutes >= 1
          ? enrichment.readingMinutes
          : h.estimatedMinutes,
      summarySource: "ai",
    });
  }
  return out;
}
