"use client";

import { useMemo, useState, useCallback, useEffect, useLayoutEffect } from "react";
import type { Article } from "@/lib/types";
import { buildArticleSequenceMap } from "@/lib/article-sequence";
import { ArticleCard } from "./ArticleCard";

export type TodoGroupMode = "theme" | "due";

interface TodoGroup {
  key: string;
  label: string;
  overdue: boolean;
  items: Article[];
}

export function TodoGroupedList({ items, mode }: { items: Article[]; mode: TodoGroupMode }) {
  const groups = useMemo(() => buildGroups(items, mode), [items, mode]);
  const sequenceMap = useMemo(() => buildArticleSequenceMap(items), [items]);
  const [collapsedTheme, setCollapsedTheme] = useState<Set<string>>(() => new Set());
  const [expandedDue, setExpandedDue] = useState<Record<string, boolean>>({});

  const toggleThemeGroup = useCallback((key: string) => {
    setCollapsedTheme((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (mode === "theme") setCollapsedTheme(new Set());
  }, [mode]);

  useLayoutEffect(() => {
    if (mode !== "due") return;
    const g = buildDueGroups(items);
    setExpandedDue(
      g.reduce<Record<string, boolean>>((acc, gr, idx) => {
        acc[gr.key] = idx === 0;
        return acc;
      }, {}),
    );
  }, [mode, items]);

  if (!groups.length) return <div className="empty">没有待阅读文章，去「添加」页新增吧。</div>;

  return (
    <div className="list-page-groups">
      {groups.map((g) => {
        if (mode === "theme") {
          const collapsed = collapsedTheme.has(g.key);
          return (
            <section key={g.key}>
              <button
                type="button"
                className="read-theme-group-head"
                onClick={() => toggleThemeGroup(g.key)}
                aria-expanded={!collapsed}
              >
                <h3 className="section-title read-theme-group-title">
                  {g.label} · {g.items.length} 篇
                </h3>
                <span className="read-theme-chevron" aria-hidden>
                  {collapsed ? "▸" : "▾"}
                </span>
              </button>
              {!collapsed &&
                g.items.map((a) => <ArticleCard key={a.id} article={a} sequenceNumber={sequenceMap.get(a.id)} />)}
            </section>
          );
        }

        return (
          <section key={g.key}>
            <button
              type="button"
              className={`card ${g.overdue ? "overdue-block" : ""}`}
              onClick={() => setExpandedDue((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            >
              <h2 style={{ color: g.overdue ? "var(--danger)" : undefined }}>
                {g.label} · {g.items.length} 篇 {expandedDue[g.key] ? "▾" : "▸"}
              </h2>
            </button>
            {expandedDue[g.key] &&
              g.items.map((a) => <ArticleCard key={a.id} article={a} sequenceNumber={sequenceMap.get(a.id)} />)}
          </section>
        );
      })}
    </div>
  );
}

function buildGroups(items: Article[], mode: TodoGroupMode): TodoGroup[] {
  return mode === "theme" ? buildThemeGroups(items) : buildDueGroups(items);
}

function buildThemeGroups(items: Article[]): TodoGroup[] {
  const todo = items.filter((a) => a.status === "todo");
  const map = new Map<string, Article[]>();
  for (const a of todo) {
    if (!map.has(a.theme)) map.set(a.theme, []);
    map.get(a.theme)!.push(a);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.addedAt.localeCompare(b.addedAt));
  }
  const groups = Array.from(map.entries()).map(([theme, list]) => ({
    key: `t:${theme}`,
    label: theme,
    overdue: false,
    items: list,
  }));
  groups.sort((a, b) => {
    const head = (arr: Article[]) => arr[0]?.dueDate || "";
    return head(a.items).localeCompare(head(b.items)) || a.label.localeCompare(b.label);
  });
  return groups;
}

function buildDueGroups(items: Article[]): TodoGroup[] {
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
