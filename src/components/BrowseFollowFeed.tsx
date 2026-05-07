"use client";

import { useCallback, useEffect, useState } from "react";
import type { Article } from "@/lib/types";
import { ArticleCard, type ArticleSocialComment } from "@/components/ArticleCard";

export function BrowseFollowFeed({ followedUserId }: { followedUserId: string }) {
  const [todo, setTodo] = useState<Article[]>([]);
  const [done, setDone] = useState<Article[]>([]);
  const [commentsByArticle, setCommentsByArticle] = useState<Record<string, ArticleSocialComment[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/social/followed-articles?userId=${encodeURIComponent(followedUserId)}`, {
        cache: "no-store",
      });
      const d = (await r.json()) as { todo?: Article[]; done?: Article[]; error?: string };
      if (!r.ok) throw new Error(d.error || "加载失败");
      const t = d.todo ?? [];
      const dn = d.done ?? [];
      setTodo(t);
      setDone(dn);
      const map: Record<string, ArticleSocialComment[]> = {};
      await Promise.all(
        dn.map(async (a) => {
          try {
            const cr = await fetch(
              `/api/social/comments?articleId=${encodeURIComponent(a.id)}&articleOwnerId=${encodeURIComponent(followedUserId)}`,
              { cache: "no-store" },
            );
            const cd = (await cr.json()) as { comments?: ArticleSocialComment[] };
            if (cr.ok) map[a.id] = cd.comments ?? [];
          } catch {
            map[a.id] = [];
          }
        }),
      );
      setCommentsByArticle(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [followedUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function refreshCommentsFor(articleId: string) {
    try {
      const cr = await fetch(
        `/api/social/comments?articleId=${encodeURIComponent(articleId)}&articleOwnerId=${encodeURIComponent(followedUserId)}`,
        { cache: "no-store" },
      );
      const cd = (await cr.json()) as { comments?: ArticleSocialComment[] };
      if (cr.ok) {
        setCommentsByArticle((m) => ({ ...m, [articleId]: cd.comments ?? [] }));
      }
    } catch {
      /* ignore */
    }
  }

  if (loading) return <p className="muted-link">加载 TA 的书库…</p>;
  if (err) return <p className="me-msg">{err}</p>;

  return (
    <div className="browse-follow-feed">
      <details open className="browse-follow-fold">
        <summary className="browse-follow-fold-title">已读 · {done.length} 篇</summary>
        <div className="browse-follow-fold-body">
          {done.length === 0 ? (
            <p className="muted-link">暂无已读</p>
          ) : (
            done.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                showActions={false}
                collapseOriginalSummary
                readOnlyBorrowed
                swipeCommentOnly
                articleOwnerIdForSocial={followedUserId}
                socialComments={commentsByArticle[a.id] ?? []}
                onSocialCommentPosted={() => void refreshCommentsFor(a.id)}
              />
            ))
          )}
        </div>
      </details>
      <details open className="browse-follow-fold browse-follow-fold--second">
        <summary className="browse-follow-fold-title">待读 · {todo.length} 篇</summary>
        <div className="browse-follow-fold-body">
          {todo.length === 0 ? (
            <p className="muted-link">暂无待读</p>
          ) : (
            todo.map((a) => (
              <ArticleCard key={a.id} article={a} showActions={false} readOnlyBorrowed />
            ))
          )}
        </div>
      </details>
    </div>
  );
}
