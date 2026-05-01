"use client";

import { useEffect, useTransition, useState, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { type Article, isIntensiveRead } from "@/lib/types";

interface Props {
  article: Article;
  showActions?: boolean;
}

type DigestMode = "markDone" | "edit";

const SWIPE_MAX_PX = 76;

function joinKeyPointsProse(points: unknown[] | undefined): string {
  const parts = (Array.isArray(points) ? points : [])
    .map((p) => String(p).trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.join("；");
}

function useSwipeTodoFace(enabled: boolean) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const [dragging, setDragging] = useState(false);
  const [mouseDragging, setMouseDragging] = useState(false);
  const dragRef = useRef<{ start: number; origin: number } | null>(null);

  const resetOffset = useCallback(() => setOffset(0), []);

  useEffect(() => {
    if (!enabled) setOffset(0);
  }, [enabled]);

  const canSwipeFrom = (t: EventTarget | null) =>
    !(t as HTMLElement | null)?.closest?.("a, button, input, textarea, select, label, summary");

  const snap = useCallback(() => {
    setOffset((o) => (o < -SWIPE_MAX_PX / 2 ? -SWIPE_MAX_PX : 0));
  }, []);

  const style: React.CSSProperties = {
    transform: `translateX(${offset}px)`,
    transition: dragging || mouseDragging ? "none" : "transform 0.2s ease",
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !canSwipeFrom(e.target)) return;
      dragRef.current = { start: e.touches[0].clientX, origin: offsetRef.current };
      setDragging(true);
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !dragRef.current) return;
      const dx = e.touches[0].clientX - dragRef.current.start;
      setOffset(Math.max(-SWIPE_MAX_PX, Math.min(0, dragRef.current.origin + dx)));
    },
    [enabled],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled) return;
    dragRef.current = null;
    setDragging(false);
    snap();
  }, [enabled, snap]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || e.button !== 0 || !canSwipeFrom(e.target)) return;
      dragRef.current = { start: e.clientX, origin: offsetRef.current };
      setMouseDragging(true);
    },
    [enabled],
  );

  useEffect(() => {
    if (!mouseDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.start;
      setOffset(Math.max(-SWIPE_MAX_PX, Math.min(0, dragRef.current.origin + dx)));
    };
    const onUp = () => {
      dragRef.current = null;
      setMouseDragging(false);
      snap();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mouseDragging, snap]);

  return {
    style,
    resetOffset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
  };
}

/** 点击打开原文；长按（约 0.55s）复制链接 */
function ArticleTitleLink({ url, children }: { url: string; children: ReactNode }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockClickRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    blockClickRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      blockClickRef.current = true;
      void navigator.clipboard.writeText(url).then(
        () => alert("已复制原文链接"),
        () => alert("复制失败，请手动从浏览器地址栏复制"),
      );
      setTimeout(() => {
        blockClickRef.current = false;
      }, 400);
    }, 550);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 100) clearTimer();
  };

  const onPointerUp = () => {
    startRef.current = null;
    clearTimer();
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="article-title-link"
      title="点击打开原文；长按复制链接"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        if (blockClickRef.current) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}

export function ArticleCard({ article, showActions = true }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestMode, setDigestMode] = useState<DigestMode>("markDone");
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePos, setMorePos] = useState<{ top: number; left: number } | null>(null);

  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePopRef = useRef<HTMLDivElement>(null);

  const swipeEnabled = showActions && article.status === "todo";
  const swipe = useSwipeTodoFace(swipeEnabled);

  const [dueDate, setDueDate] = useState(article.dueDate);
  const [theme, setTheme] = useState(article.theme);
  const [author, setAuthor] = useState(article.author || "");
  const [intensiveRead, setIntensiveRead] = useState(() => isIntensiveRead(article));
  const [tagsText, setTagsText] = useState((article.customTags || []).join(", "));
  const [readOneLiner, setReadOneLiner] = useState(article.readOneLiner || "");
  const [kp1, setKp1] = useState(article.readKeyPoints?.[0] || "");
  const [kp2, setKp2] = useState(article.readKeyPoints?.[1] || "");
  const [kp3, setKp3] = useState(article.readKeyPoints?.[2] || "");
  const [readAction, setReadAction] = useState(article.readAction || "");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setDueDate(article.dueDate);
    setTheme(article.theme);
    setAuthor(article.author || "");
    setIntensiveRead(isIntensiveRead(article));
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
    article.recommendedDepth,
    article.summary,
    article.readOneLiner,
    article.readAction,
    article.status,
    JSON.stringify(article.customTags || []),
    JSON.stringify(article.readKeyPoints || []),
  ]);

  const closeMeta = useCallback(() => setMetaOpen(false), []);
  const closeDigest = useCallback(() => setDigestOpen(false), []);
  const closeMore = useCallback(() => {
    setMoreOpen(false);
    setMorePos(null);
  }, []);

  useEffect(() => {
    if (metaOpen || digestOpen || moreOpen) swipe.resetOffset();
  }, [metaOpen, digestOpen, moreOpen, swipe.resetOffset]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (morePopRef.current?.contains(t)) return;
      if (moreBtnRef.current?.contains(t)) return;
      closeMore();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen, closeMore]);

  useEffect(() => {
    if (!metaOpen && !digestOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [metaOpen, digestOpen]);

  useEffect(() => {
    if (!metaOpen && !digestOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (digestOpen) closeDigest();
        else closeMeta();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [metaOpen, digestOpen, closeMeta, closeDigest]);

  function toggleMore(e: React.MouseEvent) {
    e.stopPropagation();
    if (moreOpen) {
      closeMore();
      return;
    }
    const el = moreBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 172;
    setMorePos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
    });
    setMoreOpen(true);
  }

  const status = computeStatus(article);

  async function call(method: "PATCH" | "DELETE", body?: object): Promise<boolean> {
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
      return true;
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta() {
    const ok = await call("PATCH", {
      dueDate,
      theme: theme.trim(),
      author: author.trim(),
      featured: intensiveRead,
      customTags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (ok) {
      closeMeta();
      closeMore();
    }
  }

  function validateDigest(): boolean {
    const one = readOneLiner.trim();
    const action = readAction.trim();
    const p1 = kp1.trim();
    const p2 = kp2.trim();
    const p3 = kp3.trim();
    if (!one || !action || !p1 || !p2 || !p3) {
      alert("请填写：一句话总结、3 条重要观点（每条非空）、1 个行动项。");
      return false;
    }
    return true;
  }

  async function submitMarkDone() {
    if (!validateDigest()) return;
    const ok = await call("PATCH", {
      status: "done",
      readOneLiner: readOneLiner.trim(),
      readKeyPoints: [kp1.trim(), kp2.trim(), kp3.trim()],
      readAction: readAction.trim(),
    });
    if (ok) {
      closeDigest();
      closeMore();
      swipe.resetOffset();
    }
  }

  async function submitDigestEdit() {
    if (!validateDigest()) return;
    const ok = await call("PATCH", {
      readOneLiner: readOneLiner.trim(),
      readKeyPoints: [kp1.trim(), kp2.trim(), kp3.trim()],
      readAction: readAction.trim(),
    });
    if (ok) {
      closeDigest();
      closeMore();
    }
  }

  function openMarkReadFromSwipe() {
    swipe.resetOffset();
    setDigestMode("markDone");
    setDigestOpen(true);
  }

  function deleteArticle() {
    if (confirm("删除这篇文章？")) {
      closeMore();
      call("DELETE");
    }
  }

  const digestComplete =
    article.status === "done" &&
    article.readOneLiner?.trim() &&
    article.readAction?.trim() &&
    (Array.isArray(article.readKeyPoints) ? article.readKeyPoints : []).filter((p) => String(p).trim()).length === 3;

  const cardTop = (
    <div className="article-card-top">
      <div className="meta-row article-card-meta">
        <span className="tag theme">{article.theme}</span>
        <span className={`tag ${isIntensiveRead(article) ? "deep" : "skim"}`}>
          {isIntensiveRead(article) ? "重点精读" : "快速扫览"}
        </span>
        <span className={`tag ${status.kind}`}>{status.label}</span>
        <span>{article.estimatedMinutes} 分钟</span>
      </div>
      {showActions && (
        <div className="article-card-more-wrap">
          <button
            ref={moreBtnRef}
            type="button"
            className="article-card-more-btn"
            onClick={toggleMore}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            aria-label="更多"
          >
            ···
          </button>
        </div>
      )}
    </div>
  );

  const cardMiddle = (
    <>
      {cardTop}
      <ArticleTitleLink url={article.url}>
        <h3 className="title">{article.title}</h3>
      </ArticleTitleLink>
      <div className="muted-link">作者：{article.author || "未知作者"}</div>

      {article.status === "todo" && article.summary && article.summary !== "(暂无摘要)" && (
        <p className="summary">{article.summary}</p>
      )}

      {article.status === "done" && article.summary && article.summary !== "(暂无摘要)" && (
        <p className="summary">{article.summary}</p>
      )}

      {article.status === "done" &&
        (digestComplete ? (
          <div className="read-after-stack">
            <p className="summary">{article.readOneLiner}</p>
            <p className="read-after-points">{joinKeyPointsProse(article.readKeyPoints)}</p>
            <p className="read-after-points">{article.readAction}</p>
          </div>
        ) : (
          <p className="muted-link">可从 ⋯ 补全读后笔记。</p>
        ))}

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
    </>
  );

  const metaModal = mounted && metaOpen && (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && closeMeta()}
    >
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="article-meta-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sheet-header">
          <h2 id="article-meta-modal-title">编辑文章信息</h2>
          <button type="button" className="modal-sheet-close" onClick={closeMeta} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-sheet-body">
          <div className="row">
            {article.status === "todo" && (
              <>
                <label className="muted-link">期望完成阅读时间</label>
                <input
                  className="input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-label="期望完成阅读时间"
                />
              </>
            )}
            <label className="muted-link">作者</label>
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="作者" />
            <label className="muted-link">主题标签</label>
            <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="主题标签" />
            <label className="muted-link">自定义标签（用逗号分隔）</label>
            <input
              className="input"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="自定义标签（用逗号分隔）"
            />
            <label className="featured-check-row">
              <input
                type="checkbox"
                className="featured-check-input"
                checked={intensiveRead}
                onChange={(e) => setIntensiveRead(e.target.checked)}
              />
              <span className="featured-check-text">重点精读</span>
            </label>
          </div>
        </div>
        <div className="modal-sheet-footer">
          <button className="btn secondary" type="button" disabled={busy} onClick={saveMeta}>
            保存
          </button>
          <button className="btn secondary" type="button" disabled={busy} onClick={closeMeta}>
            取消
          </button>
        </div>
      </div>
    </div>
  );

  const digestModal = mounted && digestOpen && (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && closeDigest()}
    >
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="article-digest-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sheet-header">
          <h2 id="article-digest-modal-title">{digestMode === "markDone" ? "标记已读（必填）" : "编辑读后笔记"}</h2>
          <button type="button" className="modal-sheet-close" onClick={closeDigest} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-sheet-body">
          <div className="row">
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
        </div>
        <div className="modal-sheet-footer">
          {digestMode === "markDone" ? (
            <button className="btn secondary" type="button" disabled={busy} onClick={submitMarkDone}>
              标记已读
            </button>
          ) : (
            <button className="btn secondary" type="button" disabled={busy} onClick={submitDigestEdit}>
              保存读后笔记
            </button>
          )}
          <button className="btn secondary" type="button" disabled={busy} onClick={closeDigest}>
            取消
          </button>
        </div>
      </div>
    </div>
  );

  const moreMenu =
    mounted && showActions && moreOpen && morePos
      ? createPortal(
          <div
            ref={morePopRef}
            className="article-more-popover"
            style={{ top: morePos.top, left: morePos.left }}
            role="menu"
          >
            <button
              type="button"
              className="article-more-item"
              role="menuitem"
              onClick={() => {
                closeMore();
                setMetaOpen(true);
              }}
            >
              编辑
            </button>
            {article.status === "todo" && (
              <button
                type="button"
                className="article-more-item"
                role="menuitem"
                onClick={() => {
                  closeMore();
                  setDigestMode("markDone");
                  setDigestOpen(true);
                }}
              >
                标记已读
              </button>
            )}
            {article.status === "done" && (
              <>
                <button
                  type="button"
                  className="article-more-item"
                  role="menuitem"
                  disabled={busy}
                  onClick={async () => {
                    closeMore();
                    await call("PATCH", { status: "todo" });
                  }}
                >
                  恢复待读
                </button>
                <button
                  type="button"
                  className="article-more-item"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    closeMore();
                    setDigestMode("edit");
                    setDigestOpen(true);
                  }}
                >
                  读后笔记
                </button>
              </>
            )}
            <button type="button" className="article-more-item danger" role="menuitem" onClick={() => deleteArticle()} disabled={busy}>
              删除
            </button>
          </div>,
          document.body,
        )
      : null;

  if (swipeEnabled) {
    return (
      <>
        <div className="article-swipe-host">
          <div className="article-swipe-underlay" aria-hidden>
            <button type="button" className="article-swipe-read-circle" onClick={openMarkReadFromSwipe} aria-label="标记已读">
              已读
            </button>
          </div>
          <article
            className="article-card article-swipe-face"
            style={swipe.style}
            onTouchStart={swipe.onTouchStart}
            onTouchMove={swipe.onTouchMove}
            onTouchEnd={swipe.onTouchEnd}
            onMouseDown={swipe.onMouseDown}
          >
            {cardMiddle}
          </article>
        </div>
        {moreMenu}
        {metaModal && createPortal(metaModal, document.body)}
        {digestModal && createPortal(digestModal, document.body)}
      </>
    );
  }

  return (
    <>
      <article className="article-card">
        {cardMiddle}
      </article>
      {moreMenu}
      {metaModal && createPortal(metaModal, document.body)}
      {digestModal && createPortal(digestModal, document.body)}
    </>
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
