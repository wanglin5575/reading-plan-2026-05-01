export type ReadingDepth = "deep" | "skim";

export interface Article {
  id: string;
  url: string;
  title: string;
  author: string;
  domain: string;
  theme: string;
  customTags: string[];
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
  /** 标记已读时必填：一句话总结 */
  readOneLiner: string;
  /** 标记已读时必填：3 条重要观点 */
  readKeyPoints: string[];
  /** 标记已读时必填：1 个行动项 */
  readAction: string;
  rawExcerpt: string;
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
}

/** 随览：单条检索结果（Firecrawl 联网 + 摘要/正文节选） */
export interface BrowseHit {
  url: string;
  title: string;
  description: string;
  summary: string;
  excerpt: string;
  /** 页面元数据中的发布时间（ISO），用于排序与时间窗过滤 */
  publishedTime?: string | null;
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
export interface PeriodReview {
  articles: Article[];
  totalMinutes: number;
  knowledgePoints: string[];
  advice: string;
}
