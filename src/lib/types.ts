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
