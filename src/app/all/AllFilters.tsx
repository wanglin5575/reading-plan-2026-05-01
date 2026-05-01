"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface Props {
  themes: string[];
  initial: { theme?: string; status?: string; q?: string };
}

export function AllFilters({ themes, initial }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [theme, setTheme] = useState(initial.theme || "all");
  const [status, setStatus] = useState(initial.status || "all");
  const [q, setQ] = useState(initial.q || "");

  function applyFilter(next: { theme?: string; status?: string; q?: string }) {
    const params = new URLSearchParams(search.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v || v === "all" || v === "") params.delete(k);
      else params.set(k, v);
    });
    router.push("/all" + (params.toString() ? `?${params.toString()}` : ""));
  }

  return (
    <div className="card">
      <h2>筛选</h2>
      <div className="row">
        <input
          className="input"
          placeholder="搜索标题 / 链接 / 摘要"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            applyFilter({ theme, status, q: e.target.value });
          }}
        />
        <div className="row two">
          <select
            className="input"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              applyFilter({ theme: e.target.value, status, q });
            }}
          >
            <option value="all">所有主题</option>
            {themes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              applyFilter({ theme, status: e.target.value, q });
            }}
          >
            <option value="all">全部状态</option>
            <option value="todo">待读</option>
            <option value="done">已读</option>
          </select>
        </div>
      </div>
    </div>
  );
}
