"use client";

import { useEffect, useMemo, useState } from "react";

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoFromLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

type Props = {
  selectedIso: string;
  maxIso: string;
  onSelect: (iso: string) => void;
};

export function MonthCalendarPicker({ selectedIso, maxIso, onSelect }: Props) {
  const max = useMemo(() => parseIsoLocal(maxIso), [maxIso]);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(parseIsoLocal(selectedIso)));

  useEffect(() => {
    setViewMonth(startOfMonth(parseIsoLocal(selectedIso)));
  }, [selectedIso]);

  const { year, monthIndex, cells } = useMemo(() => {
    const y = viewMonth.getFullYear();
    const mi = viewMonth.getMonth();
    const first = new Date(y, mi, 1);
    const startWeekday = (first.getDay() + 6) % 7;
    const dim = daysInMonth(y, mi);
    const cells: ({ kind: "blank" } | { kind: "day"; day: number })[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ kind: "blank" });
    for (let day = 1; day <= dim; day++) cells.push({ kind: "day", day });
    while (cells.length % 7 !== 0) cells.push({ kind: "blank" });
    return { year: y, monthIndex: mi, cells };
  }, [viewMonth]);

  const monthLabel = `${year}年${monthIndex + 1}月`;

  const canNext = useMemo(() => {
    const next = addMonths(viewMonth, 1);
    return startOfMonth(next) <= startOfMonth(max);
  }, [viewMonth, max]);

  return (
    <div className="month-calendar">
      <div className="month-calendar-nav">
        <button
          type="button"
          className="month-calendar-nav-btn"
          onClick={() => setViewMonth(addMonths(viewMonth, -1))}
          aria-label="上一月"
        >
          ‹
        </button>
        <span className="month-calendar-title">{monthLabel}</span>
        <button
          type="button"
          className="month-calendar-nav-btn"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          disabled={!canNext}
          aria-label="下一月"
        >
          ›
        </button>
      </div>
      <div className="month-calendar-weekdays">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="month-calendar-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="month-calendar-grid">
        {cells.map((cell, i) => {
          if (cell.kind === "blank") {
            return <div key={`b-${i}`} className="month-calendar-cell blank" />;
          }
          const d = new Date(year, monthIndex, cell.day);
          const iso = isoFromLocal(d);
          const isSel = iso === selectedIso;
          const isFuture = iso > maxIso;
          return (
            <button
              key={iso}
              type="button"
              className={`month-calendar-cell day${isSel ? " selected" : ""}${isFuture ? " muted" : ""}`}
              disabled={isFuture}
              onClick={() => !isFuture && onSelect(iso)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
