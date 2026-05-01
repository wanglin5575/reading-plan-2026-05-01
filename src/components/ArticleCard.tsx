"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { Article } from "@/lib/types";

interface Props {
  article: Article;
  showActions?: boolean;
}

export function ArticleCard({ article, showActions = true }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const status = computeStatus(article);

  async function call(method: "PATCH" | "DELETE" | "POST", body?: object, suffix = "") {
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${article.id}${suffix}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error("操作失败");
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="article-card">
      <div className="meta-row">
        <span className={`tag theme`}>{article.theme}</span>
        <span className={`tag ${article.recommendedDepth}`}>
          {article.recommendedDepth === "deep" ? "重点精读" : "快速扫览"}
        </span>
        <span className={`tag ${status.kind}`}>{status.label}</span>
        <span>{article.estimatedMinutes} 分钟 · {article.domain}</span>
      </div>
      <h3 className="title">{article.title}</h3>
      {article.summary && article.summary !== "(暂无摘要)" && (
        <p className="summary">{article.summary}</p>
      )}
      {article.knowledgeTags.length > 0 && (
        <div className="meta-row" style={{ marginTop: 6 }}>
          {article.knowledgeTags.slice(0, 6).map((tag) => (
            <span key={tag} style={{ fontSize: 11, color: "var(--muted)" }}>
              #{tag}
            </span>
          ))}
        </div>
      )}
      <a href={article.url} target="_blank" rel="noreferrer" className="url">
        {article.url}
      </a>

      {showActions && (
        <div className="actions">
          {article.status === "todo" ? (
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => call("PATCH", { status: "done" })}
            >
              标记已读
            </button>
          ) : (
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => call("PATCH", { status: "todo" })}
            >
              恢复待读
            </button>
          )}
          <button
            className="btn danger"
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm("删除这篇文章？")) call("DELETE");
            }}
          >
            删除
          </button>
        </div>
      )}
    </article>
  );
}

function computeStatus(article: Article): { kind: string; label: string } {
  if (article.status === "done") return { kind: "done", label: "已读" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(article.dueDate + "T00:00:00");
  if (due < today) return { kind: "overdue", label: "逾期" };
  if (due.getTime() === today.getTime()) return { kind: "today", label: "今日" };
  return { kind: "future", label: `${article.dueDate} 前` };
}
