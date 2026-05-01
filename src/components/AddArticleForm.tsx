"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Article } from "@/lib/types";

export function AddArticleForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  /** 添加时勾选 = 标记为「重点精读」 */
  const [featured, setFeatured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<Article | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  function defaultDueDate() {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), dueDate, featured }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "添加失败");
      }
      const data = (await res.json()) as { article?: Article };
      setLastAdded(data.article || null);
      setSuccess("添加成功");
      setUrl("");
      setFeatured(false);
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setSuccess(null);
      setLastAdded(null);
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={onSubmit}>
        <h2>添加阅读计划</h2>
        <div className="row">
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <label className="muted-link">期望完成阅读时间</label>
          <input
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="期望完成阅读时间"
          />
          <div className="featured-wrap">
            <div className="muted-link featured-choice-label" id="add-featured-label">
              是否标记为重点精读
            </div>
            <label className="featured-check-row" htmlFor="add-featured-check">
              <input
                id="add-featured-check"
                type="checkbox"
                className="featured-check-input"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                aria-labelledby="add-featured-label"
              />
              <span className="featured-check-text">重点精读</span>
            </label>
          </div>
          <button className="btn" type="submit" disabled={loading || isPending}>
            {loading ? "正在抓取…" : "添加阅读计划"}
          </button>
          {success && <div className="text-success-inline">{success}</div>}
          {error && <div className="error">{error || "添加失败"}</div>}
        </div>
      </form>

      {lastAdded && (
        <div className="card">
          <h2>添加成功内容</h2>
          <div className="muted-link">标题：{lastAdded.title}</div>
          <div className="muted-link">作者：{lastAdded.author || "未知作者"}</div>
          <div className="muted-link">主题标签：{lastAdded.theme}</div>
          <div className="muted-link">添加时间：{new Date(lastAdded.addedAt).toLocaleString()}</div>
          <div className="muted-link">期望阅读完成时间：{lastAdded.dueDate}</div>
        </div>
      )}
    </>
  );
}
