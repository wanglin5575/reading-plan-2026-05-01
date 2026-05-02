import type { Article, ReadingDepth } from "./types";
import type { MediaKind } from "./media-kind";
import { translateToChinese } from "./translate-zh";

const THEME_RULES: { theme: string; words: string[] }[] = [
  {
    theme: "AI / 大模型",
    words: [
      "ai", "llm", "gpt", "claude", "gemini", "agent", "rag",
      "machine learning", "deep learning", "transformer", "embedding",
      "人工智能", "大模型", "智能体", "提示词", "微调",
    ],
  },
  {
    theme: "产品",
    words: [
      "product", "pm", "roadmap", "growth", "ux", "ui", "feature",
      "产品", "需求", "用户体验", "增长", "迭代", "pmf",
    ],
  },
  {
    theme: "工程 / 技术",
    words: [
      "javascript", "typescript", "python", "react", "node", "api",
      "backend", "frontend", "database", "kubernetes", "docker",
      "架构", "工程", "后端", "前端", "数据库", "性能",
    ],
  },
  {
    theme: "数据",
    words: [
      "data", "sql", "warehouse", "etl", "metric", "analytics",
      "数据", "指标", "数仓", "看板", "数据分析", "数据治理",
    ],
  },
  {
    theme: "商业 / 战略",
    words: [
      "business", "strategy", "market", "startup", "finance", "saas",
      "商业", "战略", "市场", "创业", "财务", "融资", "商业模式",
    ],
  },
  {
    theme: "设计",
    words: [
      "design", "figma", "interaction",
      "设计", "交互", "视觉", "字体", "排版",
    ],
  },
  {
    theme: "管理 / 思考",
    words: [
      "management", "leadership", "okrs", "thinking",
      "管理", "领导力", "okr", "复盘", "思考", "心法",
    ],
  },
];

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "this", "that", "it", "as", "by",
  "我们", "他们", "可以", "不是", "因为", "所以", "如果", "对于", "已经",
  "什么", "怎么", "这样", "这个", "那个", "比较", "一个", "一些", "可能",
]);

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

export function classifyTheme(title: string, body: string, urlString: string): string {
  const hay = `${title} ${body.slice(0, 2000)} ${urlString}`.toLowerCase();
  let best: { theme: string; score: number } = { theme: "通用", score: 0 };
  for (const rule of THEME_RULES) {
    let score = 0;
    for (const w of rule.words) {
      if (hay.includes(w)) score += 1;
    }
    if (score > best.score) best = { theme: rule.theme, score };
  }
  return best.score > 0 ? best.theme : "通用";
}

export function estimateMinutes(charCount: number, wordCount: number, language: "zh" | "en" | "mixed"): number {
  if (language === "zh") return Math.max(1, Math.round(charCount / 350));
  if (language === "en") return Math.max(1, Math.round(wordCount / 220));
  return Math.max(1, Math.round((charCount / 350 + wordCount / 220) / 2));
}

/** 综合正文、标题与摘要长度，以及音视频时长，估算消费分钟数 */
export function estimateReadingMinutesCalibrated(
  title: string,
  body: string,
  summaryForSizing: string,
  language: "zh" | "en" | "mixed",
  opts?: { mediaKind?: MediaKind; durationSeconds?: number | null },
): number {
  if (opts?.durationSeconds != null && opts.durationSeconds >= 30) {
    return Math.max(1, Math.round(opts.durationSeconds / 60));
  }

  const titlePart = title.trim();
  const sumPart = summaryForSizing.trim();
  const bodyPart = body.trim();
  const combined = `${titlePart}\n\n${sumPart}\n\n${bodyPart}`;
  const charCount = countChars(combined);
  const wordCount = countWords(combined);
  let base = estimateMinutes(charCount, wordCount, language);

  const kind = opts?.mediaKind ?? "article";
  if (kind === "video") {
    base = Math.max(base, Math.round((charCount || 400) / 500) + 5);
    return Math.max(4, Math.min(base, 180));
  }
  if (kind === "audio") {
    base = Math.max(base, Math.round((charCount || 600) / 400) + 8);
    return Math.max(5, Math.min(base, 240));
  }

  return Math.max(2, Math.min(base, 600));
}

export function recommendDepth(charCount: number, theme: string): ReadingDepth {
  const isPrimary = ["AI / 大模型", "产品", "数据", "工程 / 技术"].includes(theme);
  if (charCount > 3500 && isPrimary) return "deep";
  if (charCount > 6000) return "deep";
  return "skim";
}

function isPrimarilyChinese(text: string): boolean {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (cjk === 0 && latin === 0) return true;
  return cjk > latin * 2;
}

/** 自动摘要上限（中文字符数，含标点） */
export const SUMMARY_MAX_CHARS = 70;

export function makeSummary(body: string): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[。！？.!?])\s*/).filter((s) => s.length > 8);
  const top = sentences.slice(0, 3).join(" ");
  return top.length > 320 ? top.slice(0, 320) + "…" : top;
}

function truncateZh(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  return /[\u4e00-\u9fff]$/.test(slice) ? slice + "…" : slice.replace(/\s+\S*$/, "").trim() + "…";
}

export function extractKnowledgeTags(title: string, body: string): string[] {
  const hay = `${title} ${body.slice(0, 3000)}`.toLowerCase();
  const tags = new Set<string>();
  for (const rule of THEME_RULES) {
    for (const w of rule.words) {
      if (hay.includes(w)) tags.add(w);
      if (tags.size >= 8) break;
    }
    if (tags.size >= 8) break;
  }
  return Array.from(tags);
}

export function getDomain(urlString: string): string {
  try {
    return new URL(urlString).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export async function buildArticleClassification(
  url: string,
  rawTitle: string,
  rawBody: string,
  opts?: { mediaKind?: MediaKind; durationSeconds?: number | null },
): Promise<
  Pick<
    Article,
    | "title"
    | "domain"
    | "theme"
    | "summary"
    | "language"
    | "charCount"
    | "wordCount"
    | "estimatedMinutes"
    | "recommendedDepth"
    | "knowledgeTags"
    | "rawExcerpt"
    | "mediaType"
    | "titleZh"
  >
> {
  const title = (rawTitle || url).trim().slice(0, 200);
  const body = rawBody || "";
  const lang = detectLanguage(`${title} ${body}`);
  const charCount = countChars(body);
  const wordCount = countWords(body);
  const theme = classifyTheme(title, body, url);
  const summary = makeSummary(body);
  let summaryZh = await translateToChinese(summary || "(暂无摘要)");
  summaryZh = truncateZh(summaryZh, SUMMARY_MAX_CHARS);
  let titleZh = "";
  if (!isPrimarilyChinese(title)) {
    const t = (await translateToChinese(title)).trim();
    if (t && t !== title) titleZh = t.slice(0, 400);
  }
  const est = estimateReadingMinutesCalibrated(title, body, summaryZh, lang, {
    mediaKind: opts?.mediaKind,
    durationSeconds: opts?.durationSeconds,
  });

  return {
    title,
    titleZh,
    domain: getDomain(url),
    theme,
    summary: summaryZh || "(暂无摘要)",
    language: lang,
    charCount,
    wordCount,
    estimatedMinutes: est,
    recommendedDepth: recommendDepth(Math.max(charCount, countChars(title) * 2), theme),
    knowledgeTags: extractKnowledgeTags(title, body),
    rawExcerpt: body.slice(0, 500),
    mediaType: opts?.mediaKind ?? "article",
  };
}
