"use client";

import { useMemo, useState } from "react";
import { ArticleCard } from "./ArticleCard";
import type { Article } from "@/lib/types";

type Mode = "theme" | "date";

export function ReadGroupedList({ items }: { items: Article[] }) {
  const [mode, setMode] = useState<Mode>("theme");
  const groups = useMemo(() => buildGroups(items, mode), [items, mode]);

  if (!groups.length) return <div className="empty">还没有已读文章，先去「添加」或「待读」开始吧。</div>;

  return (
    <>
      <p className="swipe-hint muted-link">已读列表：右上角 ⋯ 可编辑信息或删除；下方可恢复待读或编辑读后笔记。</p>
      <div className="card">
        <h2>已读分组方式</h2>
        <div className="row two">
          <button type="button" className={`btn ${mode === "theme" ? "" : "secondary"}`} onClick={() => setMode("theme")}>
            按主题（默认）
          </button>
          <button type="button" className={`btn ${mode === "date" ? "" : "secondary"}`} onClick={() => setMode("date")}>
            按完成时间
          </button>
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="section-title">{g.label} · {g.items.length} 篇</h3>
          {g.items.map((a) => <ArticleCard key={a.id} article={a} />)}
        </section>
      ))}
    </>
  );
}

function buildGroups(items: Article[], mode: Mode) {
  const sorted = [...items].sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const map = new Map<string, Article[]>();
  for (const a of sorted) {
    const key = mode === "theme" ? a.theme : a.completedAt?.slice(0, 10) || "未知日期";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  const groups = Array.from(map.entries()).map(([key, list]) => ({
    key,
    label: mode === "theme" ? key : `完成于 ${key}`,
    items: list,
  }));
  if (mode === "theme") {
    groups.sort((a, b) => (b.items[0]?.completedAt || "").localeCompare(a.items[0]?.completedAt || ""));
  } else {
    groups.sort((a, b) => b.key.localeCompare(a.key));
  }
  return groups;
}
