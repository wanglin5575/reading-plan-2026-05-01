import type { MediaKind } from "./media-kind";

export type ReadingDepth = "deep" | "skim";

export interface Article {
  id: string;
  url: string;
  title: string;
  /** 英文原标题的中文翻译，用于卡片在链接下展示；非英文稿为空字符串 */
  titleZh: string;
  author: string;
  /** 原文首次发布日期 YYYY-MM-DD；无法解析时为 null */
  publishedAt: string | null;
  domain: string;
  theme: string;
  /** 内容形态：文章 / 视频 / 音频 */
  mediaType: MediaKind;
  featured: boolean;
  summary: string;
  language: "zh" | "en" | "mixed";
  charCount: number;
  wordCount: number;
  estimatedMinutes: number;
  recommendedDepth: ReadingDepth;
  knowledgeTags: string[];
  status: "todo" | "done";
  addedAt: string;
  dueDate: string;
  completedAt: string | null;
  /** 标记已读时必填：一句话总结（可多行） */
  readOneLiner: string;
  /** 标记已读时选填：最多 3 条重要观点（持久化为 3 个槽位，可空串） */
  readKeyPoints: string[];
  /** 标记已读时必填：1 个行动项 */
  readAction: string;
  rawExcerpt: string;
  /**
   * 摘要是否由 WolfAI 结构化生成。仅当为 "ai" 时卡片才展示「AI生成：」标签；
   * 规则降级（makeSummary/翻译兜底）时为 undefined，避免把节选误标成 AI 摘要。
   * 旧数据可能为空，重新「刷新文章」后由服务端写入。
   */
  summarySource?: "ai";
  /**
   * 生成书库摘要/分类时模型实际读取的素材说明（用于「AI生成(读取…)」展示）。
   * 在添加文章或「刷新文章」时由服务端写入；旧数据可能为空。
   */
  aiReadSourcesLabel?: string;
  /** 他人通过「推荐 TA 读」写入当前用户书库（由 article_recommendations 关联判定） */
  receivedViaRecommendation?: boolean;
  /** 当前登录用户已将本篇（同 URL）推荐给哪些互关对象（对方书库中的副本） */
  recommendSentTo?: { userId: string; nickname: string; label: string }[];
}

/** 「重点精读」：算法深读或用户手动标记（原「精选」与 deep 合并展示） */
export function isIntensiveRead(article: Article): boolean {
  return article.recommendedDepth === "deep" || article.featured;
}

/** 随览：用户配置的追踪主题 */
export interface BrowseTopic {
  id: string;
  name: string;
  keywords: string[];
  sortOrder: number;
  createdAt: string;
  /**
   * A：列表里不展示「原文发布时间」早于今天往前 N 天的条目；留空用全局默认（90 天）
   */
  maxPublishedAgeDays?: number | null;
  /**
   * B：种子站/RSS/博主主页（每行一条 URL 或域名）。RSS 拉取、博主主页批量发现笔记、其余用于 Firecrawl 检索 `site:` 限定
   */
  seedSources?: string[];
  /** `xhs` = 小红书博主订阅（按博主分组展示）；默认 `topic` */
  kind?: "topic" | "xhs";
}

/** 随览：被 AI 筛除（不值得读）的条目，供「筛除记录」查看 */
export type BrowseAiRejectedItem = {
  url: string;
  title: string;
  /** 不超过 50 字 */
  reason: string;
  /** 文章作者（抓取侧或模型推断，可能为空） */
  author?: string | null;
  /** 发布位置 / 平台（由域名推断，如 YouTube、LinkedIn） */
  sourceLabel?: string | null;
  /** 本条筛除记录最后写入/刷新的时间（ISO），用于按日分组 */
  updatedAt?: string;
};

/** 随览：单条检索结果（Firecrawl 联网 + 摘要/正文节选） */
export interface BrowseHit {
  url: string;
  title: string;
  /** 英文为主标题时的中文译名（展示在原标题下灰色小字） */
  titleZh?: string;
  description: string;
  summary: string;
  excerpt: string;
  /** 内容形态：文章 / 视频 / 音频 */
  mediaType?: MediaKind;
  /** 页面元数据中的发布时间（ISO），用于排序与时间窗过滤 */
  publishedTime?: string | null;
  /** 页面元数据中的作者；缺省时卡片侧用摘要推断「主要表态」主体 */
  author?: string | null;
  /** 基于摘要+节选估算的阅读分钟数 */
  estimatedMinutes?: number;
  /**
   * 摘要是否由 WolfAI 结构化生成（随览卡片展示灰色「AI生成」标签）。
   */
  summarySource?: "ai";
  /** 随览 AI 摘要时读取的素材说明（与 summarySource=ai 同时使用） */
  aiReadSourcesLabel?: string;
  /**
   * 仅服务端：Firecrawl 检索命中全文 markdown 的节选（供 WolfAI 摘要），响应 JSON 前会剥离。
   */
  fullMarkdownForAi?: string;
  /** 小红书订阅：博主昵称（分组标题） */
  xhsBloggerName?: string | null;
  /** 小红书订阅：来源博主主页种子 URL */
  xhsProfileSeed?: string | null;
}

export interface DailyPlan {
  date: string;
  totalMinutes: number;
  deepCount: number;
  skimCount: number;
  themesToday: string[];
  knowledgePromise: string;
  items: Article[];
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  totalRead: number;
  totalMinutes: number;
  dayRecords: {
    date: string;
    articles: Article[];
    totalMinutes: number;
  }[];
  themes: { theme: string; count: number }[];
  topKnowledgeTags: string[];
  comparedToLast: {
    deltaArticles: number;
    deltaMinutes: number;
    newThemes: string[];
  };
}

/** 某周或某日回顾的聚合展示用 */
export interface ActionReviewItem {
  /** 从 1 开始的序号 */
  n: number;
  articleId: string;
  text: string;
  article: Article;
}

export interface PeriodReview {
  articles: Article[];
  totalMinutes: number;
  knowledgePoints: string[];
  advice: string;
  /** 已读且有行动项的待办行（与 advice 中「行动项回顾」拆开展示） */
  actionItems: ActionReviewItem[];
}
