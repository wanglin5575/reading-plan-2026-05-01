"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Article } from "@/lib/types";
import { buildArticleSequenceMap } from "@/lib/article-sequence";
import { ArticleCard, type ArticleSocialComment } from "@/components/ArticleCard";

export function BrowseFollowFeed({
  followedUserId,
  followPlanThemeName = "",
}: {
  followedUserId: string;
  /** 随览关注 tab 的备注名，用于写入「随览 / xxx」主题 */
  followPlanThemeName?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [todo, setTodo] = useState<Article[]>([]);
  const [done, setDone] = useState<Article[]>([]);
  const [commentsByArticle, setCommentsByArticle] = useState<Record<string, ArticleSocialComment[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [planBusyArticleId, setPlanBusyArticleId] = useState<string | null>(null);
  const [markDoneArticle, setMarkDoneArticle] = useState<Article | null>(null);
  const [rdOne, setRdOne] = useState("");
  const [rdK1, setRdK1] = useState("");
  const [rdK2, setRdK2] = useState("");
  const [rdK3, setRdK3] = useState("");
  const [rdAction, setRdAction] = useState("");

  const browseRdOneRef = useRef<HTMLTextAreaElement>(null);
  const browseRdK1Ref = useRef<HTMLTextAreaElement>(null);
  const browseRdK2Ref = useRef<HTMLTextAreaElement>(null);
  const browseRdK3Ref = useRef<HTMLTextAreaElement>(null);
  const browseRdActionRef = useRef<HTMLTextAreaElement>(null);

  const planTopicHint = followPlanThemeName.trim() || "关注的书单";
  const sequenceMap = useMemo(() => buildArticleSequenceMap([...done, ...todo]), [done, todo]);
  const markDoneOpen = markDoneArticle !== null;

  const adjustMarkDoneHeights = useCallback(() => {
    for (const r of [browseRdOneRef, browseRdK1Ref, browseRdK2Ref, browseRdK3Ref, browseRdActionRef]) {
      const el = r.current;
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${Math.min(320, Math.max(44, el.scrollHeight))}px`;
    }
  }, []);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!markDoneOpen) return;
    adjustMarkDoneHeights();
  }, [markDoneOpen, rdOne, rdK1, rdK2, rdK3, rdAction, adjustMarkDoneHeights]);

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
      const withSocial = [...t, ...dn];
      await Promise.all(
        withSocial.map(async (a) => {
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

  function openMarkDone(a: Article) {
    setMarkDoneArticle(a);
    setRdOne("");
    setRdK1("");
    setRdK2("");
    setRdK3("");
    setRdAction("");
    setPlanMsg(null);
  }

  function closeMarkDone() {
    if (planBusyArticleId) return;
    setMarkDoneArticle(null);
  }

  async function addArticleToMyTodo(a: Article) {
    if (planBusyArticleId) return;
    setPlanBusyArticleId(a.id);
    setPlanMsg(null);
    try {
      const r = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: a.url,
          quickDone: false,
          browseTopicName: planTopicHint,
        }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "添加失败");
      setPlanMsg("已加入我的待读");
      startTransition(() => router.refresh());
    } catch (e) {
      setPlanMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setPlanBusyArticleId(null);
    }
  }

  async function submitMarkDone() {
    const a = markDoneArticle;
    if (!a || planBusyArticleId) return;
    const one = rdOne.trim();
    const action = rdAction.trim();
    const points = [rdK1.trim(), rdK2.trim(), rdK3.trim()];
    if (!one || !action) {
      setPlanMsg("请填写：一句话总结、1 个行动项（重要观点选填）。");
      return;
    }
    setPlanBusyArticleId(a.id);
    setPlanMsg(null);
    try {
      const r = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: a.url,
          quickDone: true,
          browseTopicName: planTopicHint,
          readOneLiner: one,
          readKeyPoints: points,
          readAction: action,
        }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "添加失败");
      setPlanMsg("已加入我的已读");
      setMarkDoneArticle(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setPlanMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setPlanBusyArticleId(null);
    }
  }

  if (loading) return <p className="muted-link">加载 TA 的书库…</p>;
  if (err) return <p className="me-msg">{err}</p>;

  const markDoneModal =
    mounted && markDoneOpen && markDoneArticle ? (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMarkDone();
        }}
      >
        <div
          className="modal-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="follow-feed-mark-done-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <h2 id="follow-feed-mark-done-title">加入我的已读</h2>
            <button
              type="button"
              className="modal-sheet-close"
              onClick={closeMarkDone}
              disabled={planBusyArticleId !== null}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
            {markDoneArticle.title}
          </p>
          <div className="modal-sheet-body">
            <div className="row">
              <label className="muted-link" htmlFor="follow-feed-rd-one">
                一句话总结
              </label>
              <textarea
                id="follow-feed-rd-one"
                ref={browseRdOneRef}
                className="input textarea-input article-digest-oneliner-textarea"
                rows={1}
                value={rdOne}
                onChange={(e) => setRdOne(e.target.value)}
                placeholder="用一两句话概括你从文中带走的核心信息（支持多行）"
                disabled={planBusyArticleId !== null}
              />
              <label className="muted-link" htmlFor="follow-feed-rd-k1">
                3 个重要观点（选填）
              </label>
              <textarea
                id="follow-feed-rd-k1"
                ref={browseRdK1Ref}
                className="input textarea-input article-digest-oneliner-textarea"
                rows={1}
                value={rdK1}
                onChange={(e) => setRdK1(e.target.value)}
                placeholder="选填：第 1 条观点，可留空（支持多行）"
                disabled={planBusyArticleId !== null}
              />
              <textarea
                id="follow-feed-rd-k2"
                ref={browseRdK2Ref}
                className="input textarea-input article-digest-oneliner-textarea"
                rows={1}
                value={rdK2}
                onChange={(e) => setRdK2(e.target.value)}
                placeholder="选填：第 2 条观点，可留空（支持多行）"
                disabled={planBusyArticleId !== null}
              />
              <textarea
                id="follow-feed-rd-k3"
                ref={browseRdK3Ref}
                className="input textarea-input article-digest-oneliner-textarea"
                rows={1}
                value={rdK3}
                onChange={(e) => setRdK3(e.target.value)}
                placeholder="选填：第 3 条观点，可留空（支持多行）"
                disabled={planBusyArticleId !== null}
              />
              <label className="muted-link" htmlFor="follow-feed-rd-action">
                1 个行动项
              </label>
              <textarea
                id="follow-feed-rd-action"
                ref={browseRdActionRef}
                className="input textarea-input article-digest-oneliner-textarea"
                rows={1}
                value={rdAction}
                onChange={(e) => setRdAction(e.target.value)}
                placeholder="你打算在工作中具体做什么（支持多行）"
                disabled={planBusyArticleId !== null}
              />
            </div>
          </div>
          <div className="modal-sheet-footer">
            <button
              type="button"
              className="btn secondary"
              disabled={planBusyArticleId !== null}
              onClick={() => void submitMarkDone()}
            >
              {planBusyArticleId ? "提交中…" : "确认加入已读"}
            </button>
            <button type="button" className="btn secondary" disabled={planBusyArticleId !== null} onClick={closeMarkDone}>
              取消
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="browse-follow-feed">
      {planMsg ? (
        <p className="muted-link" style={{ margin: "0 0 8px", fontSize: "var(--fs-small)" }}>
          {planMsg}
        </p>
      ) : null}
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
                sequenceNumber={sequenceMap.get(a.id)}
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
              <ArticleCard
                key={a.id}
                article={a}
                sequenceNumber={sequenceMap.get(a.id)}
                showActions={false}
                readOnlyBorrowed
                swipeCommentOnly
                articleOwnerIdForSocial={followedUserId}
                socialComments={commentsByArticle[a.id] ?? []}
                onSocialCommentPosted={() => void refreshCommentsFor(a.id)}
                followPlanActions={{
                  busy: planBusyArticleId === a.id,
                  onAddTodo: () => void addArticleToMyTodo(a),
                  onAddDone: () => openMarkDone(a),
                }}
              />
            ))
          )}
        </div>
      </details>
      {markDoneModal ? createPortal(markDoneModal, document.body) : null}
    </div>
  );
}
