import { type Article, type DailyPlan, type PeriodReview, type WeeklyReview, isIntensiveRead } from "./types";

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
      const aPri = isIntensiveRead(a) ? 0 : 1;
      const bPri = isIntensiveRead(b) ? 0 : 1;
      return aPri - bPri;
    });

  const totalMinutes = candidates.reduce((acc, a) => acc + a.estimatedMinutes, 0);
  const themesToday = Array.from(new Set(candidates.map((a) => a.theme)));
  const deepCount = candidates.filter((a) => isIntensiveRead(a)).length;
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
  const dayRecords = buildDayRecords(thisWeekStart, thisWeek);

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
    dayRecords,
    themes,
    topKnowledgeTags,
    comparedToLast: {
      deltaArticles: thisWeek.length - lastWeek.length,
      deltaMinutes: totalMinutes - lastMinutes,
      newThemes,
    },
  };
}

function buildDayRecords(weekStart: string, thisWeekDone: Article[]) {
  return Array.from({ length: 7 }).map((_, idx) => {
    const date = shiftDays(weekStart, idx);
    const items = thisWeekDone
      .filter((a) => a.completedAt?.slice(0, 10) === date)
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    return {
      date,
      articles: items,
      totalMinutes: items.reduce((acc, a) => acc + a.estimatedMinutes, 0),
    };
  });
}

function completedInRange(completedAt: string | null, startIso: string, endExclusiveIso: string): boolean {
  if (!completedAt) return false;
  const dateOnly = completedAt.slice(0, 10);
  return dateOnly >= startIso && dateOnly < endExclusiveIso;
}

/** 某一自然周（weekStart 当周周一）内标记已读的文章，按完成时间倒序 */
export function filterDoneInWeek(all: Article[], weekStart: string): Article[] {
  const end = shiftDays(weekStart, 7);
  return all
    .filter((a) => a.status === "done" && completedInRange(a.completedAt, weekStart, end))
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
}

/** 某一天内标记已读的文章 */
export function filterDoneOnDay(all: Article[], date: string): Article[] {
  return all
    .filter((a) => a.status === "done" && a.completedAt?.slice(0, 10) === date)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
}

export function buildDayRecordsForScope(weekStart: string, weekArticles: Article[]) {
  return buildDayRecords(weekStart, weekArticles);
}

/** 聚合「知识点」：主题、系统关键词、你填写的 3 条观点 */
export function aggregateKnowledgePoints(articles: Article[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of articles) {
    const themeLabel = `主题：${a.theme}`;
    if (a.theme && !seen.has(themeLabel)) {
      seen.add(themeLabel);
      out.push(themeLabel);
    }
    for (const t of a.knowledgeTags || []) {
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    for (const p of a.readKeyPoints || []) {
      const s = String(p).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out.slice(0, 24);
}

/** 周期复盘建议文案 */
export function buildAdviceForPeriod(articles: Article[], periodLabel: string): string {
  if (!articles.length) {
    return `${periodLabel}暂无已读记录。完成阅读并填写总结与行动项后，我们会基于你的笔记生成建议。`;
  }
  const totalMin = articles.reduce((s, a) => s + a.estimatedMinutes, 0);
  const themes = [...new Set(articles.map((a) => a.theme))];
  const intensiveCount = articles.filter((a) => isIntensiveRead(a)).length;
  const parts: string[] = [];
  parts.push(`${periodLabel}共完成 ${articles.length} 篇，累计预估阅读约 ${totalMin} 分钟。`);
  parts.push(`内容覆盖：${themes.slice(0, 8).join("、")}${themes.length > 8 ? "…" : ""}。`);
  if (intensiveCount > 0) {
    parts.push(`其中有 ${intensiveCount} 篇重点精读，建议优先核对你的「一句话总结」是否仍适用于当前工作上下文。`);
  }
  const actions = [...new Set(articles.map((a) => a.readAction).filter(Boolean))];
  if (actions.length) {
    parts.push(`行动项回顾：${actions.slice(0, 6).join("；")}${actions.length > 6 ? "…" : ""}。`);
  }
  return parts.join(" ");
}

export function buildPeriodReviewFromArticles(articles: Article[], periodLabel: string): PeriodReview {
  const totalMinutes = articles.reduce((s, a) => s + a.estimatedMinutes, 0);
  return {
    articles,
    totalMinutes,
    knowledgePoints: aggregateKnowledgePoints(articles),
    advice: buildAdviceForPeriod(articles, periodLabel),
  };
}
