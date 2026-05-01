import type { Article, DailyPlan, WeeklyReview } from "./types";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfWeekIso(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayIdx = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayIdx);
  return d.toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildDailyPlan(all: Article[], date: string = todayIso()): DailyPlan {
  const candidates = all
    .filter((a) => a.status === "todo" && a.dueDate <= date)
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      const aPri = a.recommendedDepth === "deep" ? 0 : 1;
      const bPri = b.recommendedDepth === "deep" ? 0 : 1;
      return aPri - bPri;
    });

  const totalMinutes = candidates.reduce((acc, a) => acc + a.estimatedMinutes, 0);
  const themesToday = Array.from(new Set(candidates.map((a) => a.theme)));
  const deepCount = candidates.filter((a) => a.recommendedDepth === "deep").length;
  const skimCount = candidates.length - deepCount;

  return {
    date,
    totalMinutes,
    deepCount,
    skimCount,
    themesToday,
    knowledgePromise: buildKnowledgePromise(candidates),
    items: candidates,
  };
}

function buildKnowledgePromise(items: Article[]): string {
  if (!items.length) return "今天暂无安排，可以加入新的链接，或者休息一下。";
  const themeTags = Array.from(new Set(items.map((a) => a.theme))).slice(0, 4);
  const knowledge = Array.from(new Set(items.flatMap((a) => a.knowledgeTags))).slice(0, 8);
  const themeLine = themeTags.length ? `覆盖主题：${themeTags.join(" / ")}` : "";
  const knowledgeLine = knowledge.length ? `关键词：${knowledge.join("、")}` : "";
  return [themeLine, knowledgeLine].filter(Boolean).join("。") || "完成今天的阅读，会扩充你最近关注领域的认知。";
}

export function buildWeeklyReview(all: Article[]): WeeklyReview {
  const thisWeekStart = startOfWeekIso();
  const thisWeekEnd = shiftDays(thisWeekStart, 7);
  const lastWeekStart = shiftDays(thisWeekStart, -7);

  const inRange = (iso: string | null, startIso: string, endIso: string) => {
    if (!iso) return false;
    const dateOnly = iso.slice(0, 10);
    return dateOnly >= startIso && dateOnly < endIso;
  };

  const thisWeek = all.filter((a) => a.status === "done" && inRange(a.completedAt, thisWeekStart, thisWeekEnd));
  const lastWeek = all.filter((a) => a.status === "done" && inRange(a.completedAt, lastWeekStart, thisWeekStart));

  const themeMap = new Map<string, number>();
  for (const a of thisWeek) themeMap.set(a.theme, (themeMap.get(a.theme) ?? 0) + 1);
  const themes = Array.from(themeMap.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);

  const lastThemes = new Set(lastWeek.map((a) => a.theme));
  const newThemes = Array.from(new Set(thisWeek.map((a) => a.theme))).filter((t) => !lastThemes.has(t));

  const totalMinutes = thisWeek.reduce((acc, a) => acc + a.estimatedMinutes, 0);
  const lastMinutes = lastWeek.reduce((acc, a) => acc + a.estimatedMinutes, 0);

  const knowledgeCount = new Map<string, number>();
  for (const a of thisWeek) {
    for (const tag of a.knowledgeTags) knowledgeCount.set(tag, (knowledgeCount.get(tag) ?? 0) + 1);
  }
  const topKnowledgeTags = Array.from(knowledgeCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  return {
    weekStart: thisWeekStart,
    weekEnd: shiftDays(thisWeekEnd, -1),
    totalRead: thisWeek.length,
    totalMinutes,
    themes,
    topKnowledgeTags,
    comparedToLast: {
      deltaArticles: thisWeek.length - lastWeek.length,
      deltaMinutes: totalMinutes - lastMinutes,
      newThemes,
    },
  };
}
