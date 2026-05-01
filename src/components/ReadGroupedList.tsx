"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { ArticleCard } from "./ArticleCard";
import type { Article } from "@/lib/types";

export type ReadGroupMode = "theme" | "date";

export function ReadGroupedList({ items, mode }: { items: Article[]; mode: ReadGroupMode }) {
  const groups = useMemo(() => buildGroups(items, mode), [items, mode]);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());

  const toggleThemeGroup = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    setCollapsedKeys(new Set());
  }, [mode]);

  if (!groups.length) return <div className="empty">还没有已读文章，先去「添加」或「待读」开始吧。</div>;

  return (
    <div className="list-page-groups">
      {groups.map((g) => {
        const isTheme = mode === "theme";
        const collapsed = isTheme && collapsedKeys.has(g.key);
        return (
          <section key={g.key}>
            {isTheme ? (
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
            ) : (
              <h3 className="section-title">
                {g.label} · {g.items.length} 篇
              </h3>
            )}
            {!collapsed && g.items.map((a) => <ArticleCard key={a.id} article={a} />)}
          </section>
        );
      })}
    </div>
  );
}

function buildGroups(items: Article[], mode: ReadGroupMode) {
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
