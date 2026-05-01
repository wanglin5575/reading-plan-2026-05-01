export type ReadingDepth = "deep" | "skim";

export interface Article {
  id: string;
  url: string;
  title: string;
  domain: string;
  theme: string;
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
  themes: { theme: string; count: number }[];
  topKnowledgeTags: string[];
  comparedToLast: {
    deltaArticles: number;
    deltaMinutes: number;
    newThemes: string[];
  };
}
