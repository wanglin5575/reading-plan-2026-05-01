"use client";

import { useEffect, useTransition, useState } from "react";
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
  const [dueDate, setDueDate] = useState(article.dueDate);
  const [theme, setTheme] = useState(article.theme);
  const [author, setAuthor] = useState(article.author || "");
  const [featured, setFeatured] = useState(article.featured);
  const [tagsText, setTagsText] = useState((article.customTags || []).join(", "));
  const [readOneLiner, setReadOneLiner] = useState(article.readOneLiner || "");
  const [kp1, setKp1] = useState(article.readKeyPoints?.[0] || "");
  const [kp2, setKp2] = useState(article.readKeyPoints?.[1] || "");
  const [kp3, setKp3] = useState(article.readKeyPoints?.[2] || "");
  const [readAction, setReadAction] = useState(article.readAction || "");

  useEffect(() => {
    setDueDate(article.dueDate);
    setTheme(article.theme);
    setAuthor(article.author || "");
    setFeatured(article.featured);
    setTagsText((article.customTags || []).join(", "));
    setReadOneLiner(article.readOneLiner || "");
    setKp1(article.readKeyPoints?.[0] || "");
    setKp2(article.readKeyPoints?.[1] || "");
    setKp3(article.readKeyPoints?.[2] || "");
    setReadAction(article.readAction || "");
  }, [
    article.id,
    article.dueDate,
    article.theme,
    article.author,
    article.featured,
    article.summary,
    article.readOneLiner,
    article.readAction,
    article.status,
    JSON.stringify(article.customTags || []),
    JSON.stringify(article.readKeyPoints || []),
  ]);

  const status = computeStatus(article);

  async function call(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method,
        headers: method === "DELETE" ? undefined : { "content-type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "操作失败");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const digestComplete =
    article.status === "done" &&
    article.readOneLiner?.trim() &&
    article.readAction?.trim() &&
    (Array.isArray(article.readKeyPoints) ? article.readKeyPoints : []).filter((p) => String(p).trim()).length === 3;

  return (
    <article className="article-card">
      <div className="meta-row">
        <span className="tag theme">{article.theme}</span>
        {article.featured && <span className="tag today">精选</span>}
        <span className={`tag ${article.recommendedDepth}`}>
          {article.recommendedDepth === "deep" ? "重点精读" : "快速扫览"}
        </span>
        <span className={`tag ${status.kind}`}>{status.label}</span>
        <span>
          {article.estimatedMinutes} 分钟 · {article.domain}
        </span>
      </div>
      <h3 className="title">{article.title}</h3>
      <div className="muted-link">作者：{article.author || "未知作者"}</div>

      {article.status === "done" && (
        <div className="read-digest">
          <div className="read-digest-label">读后输出</div>
          {!digestComplete ? (
            <p className="muted-link">历史数据缺少读后笔记，可在下方补全并保存。</p>
          ) : (
            <>
              <p className="read-digest-one">{article.readOneLiner}</p>
              <ol className="read-digest-points">
                {(Array.isArray(article.readKeyPoints) ? article.readKeyPoints : []).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
              <p className="read-digest-action">
                <span className="read-digest-sublabel">行动项</span> {article.readAction}
              </p>
            </>
          )}
        </div>
      )}

      {article.status === "done" && article.summary && article.summary !== "(暂无摘要)" && (
        <details className="read-auto-summary">
          <summary>原文自动摘要（参考）</summary>
          <p className="summary">{article.summary}</p>
        </details>
      )}

      {article.status === "todo" && article.summary && article.summary !== "(暂无摘要)" && (
        <p className="summary">{article.summary}</p>
      )}

      {Array.isArray(article.knowledgeTags) && article.knowledgeTags.length > 0 && (
        <div className="meta-row" style={{ marginTop: 6 }}>
          {article.knowledgeTags.slice(0, 6).map((tag) => (
            <span key={tag} className="meta-tags-knowledge">
              #{tag}
            </span>
          ))}
        </div>
      )}
      {Array.isArray(article.customTags) && article.customTags.length > 0 && (
        <div className="meta-row" style={{ marginTop: 4 }}>
          {article.customTags.map((tag) => (
            <span key={tag} className="tag theme">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <a href={article.url} target="_blank" rel="noreferrer" className="url">
        {article.url}
      </a>

      {showActions && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            {article.status === "todo" && (
              <input
                className="input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="期望完成阅读时间"
              />
            )}
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="作者" />
            <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="主题标签" />
            <input
              className="input"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="自定义标签（用逗号分隔）"
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              精选文章
            </label>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                call("PATCH", {
                  dueDate,
                  theme: theme.trim(),
                  author: author.trim(),
                  featured,
                  customTags: tagsText
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            >
              保存标签与属性
            </button>
          </div>

          {article.status === "todo" && (
            <div className="card read-submit-card">
              <h2>标记已读（必填）</h2>
              <label className="muted-link">一句话总结</label>
              <input
                className="input"
                value={readOneLiner}
                onChange={(e) => setReadOneLiner(e.target.value)}
                placeholder="用一句话概括你从文中带走的核心信息"
              />
              <label className="muted-link">3 个重要观点</label>
              <input className="input" value={kp1} onChange={(e) => setKp1(e.target.value)} placeholder="观点 1" />
              <input className="input" value={kp2} onChange={(e) => setKp2(e.target.value)} placeholder="观点 2" />
              <input className="input" value={kp3} onChange={(e) => setKp3(e.target.value)} placeholder="观点 3" />
              <label className="muted-link">1 个行动项</label>
              <input
                className="input"
                value={readAction}
                onChange={(e) => setReadAction(e.target.value)}
                placeholder="你打算在工作中具体做什么"
              />
            </div>
          )}

          {article.status === "done" && (
            <div className="card read-submit-card">
              <h2>编辑读后笔记</h2>
              <label className="muted-link">一句话总结</label>
              <input className="input" value={readOneLiner} onChange={(e) => setReadOneLiner(e.target.value)} />
              <label className="muted-link">3 个重要观点</label>
              <input className="input" value={kp1} onChange={(e) => setKp1(e.target.value)} placeholder="观点 1" />
              <input className="input" value={kp2} onChange={(e) => setKp2(e.target.value)} placeholder="观点 2" />
              <input className="input" value={kp3} onChange={(e) => setKp3(e.target.value)} placeholder="观点 3" />
              <label className="muted-link">1 个行动项</label>
              <input className="input" value={readAction} onChange={(e) => setReadAction(e.target.value)} />
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                style={{ marginTop: 8 }}
                onClick={() =>
                  call("PATCH", {
                    readOneLiner: readOneLiner.trim(),
                    readKeyPoints: [kp1.trim(), kp2.trim(), kp3.trim()],
                    readAction: readAction.trim(),
                  })
                }
              >
                保存读后笔记
              </button>
            </div>
          )}

          <div className="actions">
            {article.status === "todo" ? (
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  call("PATCH", {
                    status: "done",
                    readOneLiner: readOneLiner.trim(),
                    readKeyPoints: [kp1.trim(), kp2.trim(), kp3.trim()],
                    readAction: readAction.trim(),
                  })
                }
              >
                标记已读
              </button>
            ) : (
              <button className="btn secondary" type="button" disabled={busy} onClick={() => call("PATCH", { status: "todo" })}>
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
        </>
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
