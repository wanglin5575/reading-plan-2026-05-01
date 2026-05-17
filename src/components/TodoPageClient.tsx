"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { TodoDigestBar } from "@/components/TodoDigestBar";
import { TodoGroupedList, type TodoGroupMode } from "./TodoGroupedList";

export function TodoPageClient({
  items,
  planTotalMinutes,
  planTodayCount,
  deepCount,
  skimCount,
  signedIn,
  accountEmail,
  isAdmin,
  fanUnreadCount,
}: {
  items: Article[];
  planTotalMinutes: number;
  planTodayCount: number;
  deepCount: number;
  skimCount: number;
  signedIn: boolean;
  accountEmail: string | null;
  isAdmin: boolean;
  fanUnreadCount: number;
}) {
  const [mode, setMode] = useState<TodoGroupMode>("theme");

  return (
    <>
      <header className="app-header app-header-with-actions app-header--tight">
        <div className="app-header-titles">
          <h1>待读</h1>
          <div className="read-header-meta-row">
            <span className="sub">
              共 {items.length} 篇 · 今日建议 {planTodayCount} 篇 · 约 {planTotalMinutes} 分钟
            </span>
            <select
              className="read-group-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as TodoGroupMode)}
              aria-label="待读分组方式"
            >
              <option value="theme">按主题</option>
              <option value="due">按期望完成时间</option>
            </select>
          </div>
        </div>
        <WeeklyAccountEntry email={accountEmail} isAdmin={isAdmin} fanUnreadCount={fanUnreadCount} />
      </header>

      <section className="kpi-row todo-page-kpi" aria-label="待读概览">
        <div className="kpi">
          <div className="label">今日建议用时</div>
          <div className="value">
            {planTotalMinutes}
            <span className="text-unit">分钟</span>
          </div>
        </div>
        <div className="kpi">
          <div className="label">待读篇数</div>
          <div className="value">{items.length}</div>
        </div>
        <div className="kpi">
          <div className="label">重点精读</div>
          <div className="value">{deepCount}</div>
        </div>
        <div className="kpi">
          <div className="label">快速扫览</div>
          <div className="value">{skimCount}</div>
        </div>
      </section>

      <TodoDigestBar signedIn={signedIn} />

      <TodoGroupedList items={items} mode={mode} />
    </>
  );
}
