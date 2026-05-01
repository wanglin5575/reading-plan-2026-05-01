"use client";

import { useMemo, useState } from "react";
import type { Article } from "@/lib/types";
import { ArticleCard } from "./ArticleCard";

interface Group {
  key: string;
  label: string;
  overdue: boolean;
  items: Article[];
}

export function TodoGroupedList({ items }: { items: Article[] }) {
  const groups = useMemo(() => buildGroups(items), [items]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    groups.reduce<Record<string, boolean>>((acc, g, idx) => {
      acc[g.key] = idx === 0;
      return acc;
    }, {}),
  );

  if (!groups.length) return <div className="empty">没有待阅读文章，去「添加」页新增吧。</div>;

  return (
    <>
      <p className="swipe-hint muted-link">
        待读卡片向右滑动可露出绿色「已读」按钮；右上角 ⋯ 可编辑、标记已读或删除。
      </p>
      {groups.map((g) => (
        <section key={g.key}>
          <button
            type="button"
            className={`card ${g.overdue ? "overdue-block" : ""}`}
            onClick={() => setExpanded((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
            style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
          >
            <h2 style={{ color: g.overdue ? "var(--danger)" : undefined }}>
              {g.label} · {g.items.length} 篇 {expanded[g.key] ? "▾" : "▸"}
            </h2>
          </button>
          {expanded[g.key] && g.items.map((a) => <ArticleCard key={a.id} article={a} />)}
        </section>
      ))}
    </>
  );
}

function buildGroups(items: Article[]): Group[] {
  const todo = items
    .filter((a) => a.status === "todo")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.addedAt.localeCompare(b.addedAt));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const map = new Map<string, Article[]>();

  for (const a of todo) {
    const due = new Date(a.dueDate + "T00:00:00");
    const key = due < today ? "overdue" : a.dueDate;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  const groups = Array.from(map.entries()).map(([key, list]) => ({
    key,
    overdue: key === "overdue",
    label: key === "overdue" ? "逾期未读" : `期望完成：${key}`,
    items: list,
  }));

  groups.sort((a, b) => {
    if (a.overdue && !b.overdue) return -1;
    if (!a.overdue && b.overdue) return 1;
    return a.key.localeCompare(b.key);
  });
  return groups;
}
