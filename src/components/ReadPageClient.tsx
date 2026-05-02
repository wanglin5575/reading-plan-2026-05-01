"use client";

import { useMemo, useState } from "react";
import { ReadGroupedList, type ReadGroupMode } from "./ReadGroupedList";
import { type Article, isIntensiveRead } from "@/lib/types";

export function ReadPageClient({ items }: { items: Article[] }) {
  const [mode, setMode] = useState<ReadGroupMode>("theme");
  const intensiveDoneCount = useMemo(() => items.filter((a) => isIntensiveRead(a)).length, [items]);

  return (
    <>
      <header className="app-header app-header--tight">
        <h1>已读</h1>
        <div className="read-header-meta-row">
          <span className="sub">共 {items.length} 篇</span>
          <select
            className="read-group-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as ReadGroupMode)}
            aria-label="已读分组方式"
          >
            <option value="theme">按主题</option>
            <option value="date">按完成时间</option>
          </select>
        </div>
      </header>

      <section className="kpi-row read-page-kpi" aria-label="已读概览">
        <div className="kpi">
          <div className="label">已读篇数</div>
          <div className="value">
            {items.length}
            <span className="text-unit">篇</span>
          </div>
        </div>
        <div className="kpi">
          <div className="label">精读篇数</div>
          <div className="value">
            {intensiveDoneCount}
            <span className="text-unit">篇</span>
          </div>
        </div>
      </section>

      <ReadGroupedList items={items} mode={mode} />
    </>
  );
}
