"use client";

import { useMemo, useState, useEffect } from "react";
import type { Article, ActionReviewItem } from "@/lib/types";
import {
  shiftDays,
  todayIso,
  startOfWeekIso,
  filterDoneInWeek,
  filterDoneOnDay,
  buildPeriodReviewFromArticles,
} from "@/lib/plan";
import { formatUsd } from "@/lib/admin-usage-format";
import { ArticleCard, ArticleTitleLink } from "./ArticleCard";
import { MonthCalendarPicker } from "./MonthCalendarPicker";
import { buildArticlePreviewSource } from "@/lib/article-preview-source";

type ViewMode = "week" | "day";

function ReviewActionTodoList({
  items,
  periodKey,
  viewMode,
}: {
  items: ActionReviewItem[];
  periodKey: string;
  viewMode: ViewMode;
}) {
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const it of items) {
      const k = `review-action-done:${viewMode}:${periodKey}:${it.articleId}`;
      next[it.articleId] = typeof localStorage !== "undefined" && localStorage.getItem(k) === "1";
    }
    setDoneMap(next);
  }, [items, periodKey, viewMode]);

  function toggle(articleId: string) {
    const k = `review-action-done:${viewMode}:${periodKey}:${articleId}`;
    setDoneMap((m) => {
      const nextVal = !m[articleId];
      if (typeof localStorage !== "undefined") {
        if (nextVal) localStorage.setItem(k, "1");
        else localStorage.removeItem(k);
      }
      return { ...m, [articleId]: nextVal };
    });
  }

  if (!items.length) return null;

  return (
    <div className="review-action-todos">
      <h3 className="review-action-todos-title">行动回顾</h3>
      <ul className="review-action-todos-list">
        {items.map((it) => (
          <li key={it.articleId} className={`review-action-todos-item${doneMap[it.articleId] ? " is-done" : ""}`}>
            <label className="review-action-todos-check">
              <input
                type="checkbox"
                checked={Boolean(doneMap[it.articleId])}
                onChange={() => toggle(it.articleId)}
                aria-label={doneMap[it.articleId] ? "标为未完成" : "标为已完成"}
              />
            </label>
            <ArticleTitleLink
              previewCacheNamespaceId={it.articleId}
              url={it.article.url}
              previewTitle={it.article.titleZh?.trim() ? it.article.titleZh : it.article.title}
              previewSourceText={buildArticlePreviewSource(it.article)}
            >
              <span className="review-action-todos-num">{it.n}</span>
            </ArticleTitleLink>
            <span className="review-action-todos-text">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function formatMd(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function DeltaBadge({ value, unit }: { value: number; unit: string }) {
  const kind = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return (
    <span className={`delta ${kind}`}>
      {arrow} {Math.abs(value)} {unit}
    </span>
  );
}

export default function WeeklyReviewClient({
  articles,
  initialWeekStart,
  initialDay,
  kpiExtras,
}: {
  articles: Article[];
  initialWeekStart: string;
  initialDay: string;
  kpiExtras?: { historyDoneCount: number; totalTokenUsd: number; weekTokenUsd: number };
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [dayCalendarOpen, setDayCalendarOpen] = useState(false);

  const weekArticles = useMemo(() => filterDoneInWeek(articles, weekStart), [articles, weekStart]);

  const dayArticles = useMemo(() => filterDoneOnDay(articles, selectedDay), [articles, selectedDay]);

  const weekReview = useMemo(
    () => buildPeriodReviewFromArticles(weekArticles, `${weekStart} 起的一周`),
    [weekArticles, weekStart],
  );

  const dayReview = useMemo(
    () => buildPeriodReviewFromArticles(dayArticles, `${selectedDay}`),
    [dayArticles, selectedDay],
  );

  const kpiWeek = useMemo(() => {
    const lastWs = shiftDays(weekStart, -7);
    const prev = filterDoneInWeek(articles, lastWs);
    const curMin = weekArticles.reduce((s, a) => s + a.estimatedMinutes, 0);
    const prevMin = prev.reduce((s, a) => s + a.estimatedMinutes, 0);
    return {
      totalRead: weekArticles.length,
      totalMinutes: curMin,
      deltaArticles: weekArticles.length - prev.length,
      deltaMinutes: curMin - prevMin,
    };
  }, [articles, weekArticles, weekStart]);

  const kpiResolved = useMemo(() => {
    return (
      kpiExtras ?? {
        historyDoneCount: articles.filter((a) => a.status === "done").length,
        totalTokenUsd: 0,
        weekTokenUsd: 0,
      }
    );
  }, [kpiExtras, articles]);

  const kpiDay = useMemo(() => {
    const totalMinutes = dayArticles.reduce((s, a) => s + a.estimatedMinutes, 0);
    return { totalRead: dayArticles.length, totalMinutes };
  }, [dayArticles]);

  const weekEndDisplay = shiftDays(weekStart, 6);

  const today = todayIso();

  const thisWeekStart = useMemo(
    () => startOfWeekIso(new Date(`${today}T12:00:00`)),
    [today],
  );

  const weekStripIsos = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i)),
    [weekStart],
  );

  /** 仅在「含今天的自然周」之前的历史周可点下一周；已处于本周或之后则置灰（不进入未来周） */
  const canGoNextWeek = weekStart < thisWeekStart;

  const goPrevWeek = () => {
    setViewMode("week");
    setWeekStart(shiftDays(weekStart, -7));
  };

  const goNextWeek = () => {
    if (!canGoNextWeek) return;
    setViewMode("week");
    setWeekStart(shiftDays(weekStart, 7));
  };

  const goThisWeek = () => {
    setViewMode("week");
    setWeekStart(thisWeekStart);
  };

  const onDayCellClick = (iso: string) => {
    setViewMode("day");
    setSelectedDay(iso);
  };

  const onCalendarPick = (iso: string) => {
    setViewMode("day");
    setSelectedDay(iso);
    setWeekStart(startOfWeekIso(new Date(`${iso}T12:00:00`)));
    setDayCalendarOpen(false);
  };

  const jumpToday = () => {
    setViewMode("day");
    setSelectedDay(today);
    setWeekStart(thisWeekStart);
    setDayCalendarOpen(false);
  };

  /** 按日查看时展示，或周不在当前自然周时展示，便于回到「本周」周视图 */
  const showThisWeekBtn = viewMode === "day" || weekStart !== thisWeekStart;

  return (
    <div className="weekly-review-stack">
      {viewMode === "week" ? (
        <section className="kpi-row">
          <div className="kpi">
            <div className="label">历史累计已读</div>
            <div className="value">
              {kpiResolved.historyDoneCount}
              <span className="text-unit">篇</span>
            </div>
            <div className="kpi-sub muted-link">本周 {kpiWeek.totalRead} 篇</div>
          </div>
          <div className="kpi">
            <div className="label">本周阅读时长</div>
            <div className="value">
              {kpiWeek.totalMinutes}
              <span className="text-unit">分钟</span>
            </div>
          </div>
          <div className="kpi">
            <div className="label">较上一周</div>
            <div className="value">
              <DeltaBadge value={kpiWeek.deltaArticles} unit="篇" />
            </div>
            <div className="kpi-sub muted-link">
              时长 <DeltaBadge value={kpiWeek.deltaMinutes} unit="分钟" />
            </div>
          </div>
          <div className="kpi">
            <div className="label">累计 Token 估算</div>
            <div className="value">{formatUsd(kpiResolved.totalTokenUsd)}</div>
            <div className="kpi-sub muted-link">本周 {formatUsd(kpiResolved.weekTokenUsd)}</div>
          </div>
        </section>
      ) : (
        <section className="kpi-row" style={{ maxWidth: "100%" }}>
          <div className="kpi">
            <div className="label">当日读完</div>
            <div className="value">
              {kpiDay.totalRead}
              <span className="text-unit">篇</span>
            </div>
          </div>
          <div className="kpi">
            <div className="label">阅读时长</div>
            <div className="value">
              {kpiDay.totalMinutes}
              <span className="text-unit">分钟</span>
            </div>
          </div>
        </section>
      )}

      <div className="card day-picker-card day-picker-compact">
        <div className="day-picker-card-head">
          <h2>选择日期</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {showThisWeekBtn && (
              <button type="button" className="week-picker-this" onClick={goThisWeek}>
                本周
              </button>
            )}
            <button
              type="button"
              className="day-calendar-expand-btn"
              onClick={() => setDayCalendarOpen((o) => !o)}
              aria-expanded={dayCalendarOpen}
              aria-label={dayCalendarOpen ? "收起日历" : "展开日历"}
              title={dayCalendarOpen ? "收起日历" : "展开日历选历史日期"}
            >
              <span className="day-calendar-expand-icon" aria-hidden>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M3 10h18M8 2v4M16 2v4" />
                </svg>
              </span>
            </button>
          </div>
        </div>
        <div className="week-range-row">
          <button type="button" className="week-nav-btn" onClick={goPrevWeek}>
            上一周
          </button>
          <div className="day-strip" role="list" aria-label="选择具体日期为按日查看，上一周下一周为按周查看">
            {weekStripIsos.map((iso, idx) => {
              const isFuture = iso > today;
              const isSelected = viewMode === "day" && iso === selectedDay;
              const isTodayCell = viewMode === "day" && iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  role="listitem"
                  className={`day-strip-cell${isSelected ? " selected" : ""}${isTodayCell ? " is-today" : ""}`}
                  disabled={isFuture}
                  onClick={() => onDayCellClick(iso)}
                >
                  <span className="day-strip-wd">周{WEEKDAY_LABELS[idx]}</span>
                  <span className="day-strip-d">{formatMd(iso)}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="week-nav-btn"
            onClick={goNextWeek}
            disabled={!canGoNextWeek}
            aria-disabled={!canGoNextWeek}
            title={!canGoNextWeek ? "已在本周，无法查看未来周" : undefined}
          >
            下一周
          </button>
        </div>
        <p className="day-picker-hint">
          {weekStart} ～ {weekEndDisplay}（周一至周日）
          {viewMode === "week" ? " · 点选具体日期可查看当日" : ""}
        </p>
        {!weekStripIsos.includes(selectedDay) && viewMode === "day" && (
          <p className="day-picker-hint">
            当前查看 {selectedDay}（日历所选日期不在上述周内时会出现；可点展开日历切换）
          </p>
        )}
        {dayCalendarOpen && (
          <div className="day-calendar-expanded">
            <MonthCalendarPicker
              selectedIso={viewMode === "day" ? selectedDay : undefined}
              anchorIso={viewMode === "day" ? selectedDay : weekStart}
              maxIso={today}
              onSelect={onCalendarPick}
            />
            <button type="button" className="btn secondary weekly-review-jump-today" onClick={jumpToday}>
              跳到今日
            </button>
          </div>
        )}
      </div>

      {viewMode === "week" ? (
        <>
          <div className="card">
            <h2>复盘建议</h2>
            <p className="review-advice">{weekReview.advice}</p>
            <ReviewActionTodoList items={weekReview.actionItems} periodKey={weekStart} viewMode="week" />
          </div>

          <div className="card">
            <h2>当周已读列表</h2>
            {weekArticles.length === 0 ? (
              <p className="muted-link">该周内暂无已读文章。</p>
            ) : (
              weekArticles.map((a) => <ArticleCard key={a.id} article={a} collapseOriginalSummary />)
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <h2>复盘建议</h2>
            <p className="review-advice">{dayReview.advice}</p>
            <ReviewActionTodoList items={dayReview.actionItems} periodKey={selectedDay} viewMode="day" />
          </div>

          <div className="card">
            <h2>当日已读列表</h2>
            {dayReview.articles.length === 0 ? (
              <p className="muted-link">该日暂无已读文章。</p>
            ) : (
              dayReview.articles.map((a) => <ArticleCard key={a.id} article={a} collapseOriginalSummary />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
