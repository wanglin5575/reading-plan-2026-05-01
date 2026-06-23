"use client";

import { useEffect, useLayoutEffect, useTransition, useState, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { type Article, isIntensiveRead } from "@/lib/types";
import { useSwipeCardFace } from "@/lib/useSwipeCardFace";
import { MEDIA_KIND_LABEL } from "@/lib/media-kind";
import { formatPublishedTimeZh } from "@/lib/browse-attribution";
import { ArticleReadPreviewModal } from "@/components/ArticleReadPreviewModal";
import { fallbackReadModalBody } from "@/lib/read-modal-fallback";
import { clearReadPreviewUiCache, getReadPreviewUiCache, setReadPreviewUiCache } from "@/lib/read-preview-ui-cache";
import { readPreviewSourceFromApiPayload, type ReadPreviewSource } from "@/lib/read-preview-source";
import { buildArticlePreviewSource } from "@/lib/article-preview-source";
import { buildReadPreviewInputLabel, resolveArticleAiReadLabel } from "@/lib/ai-read-sources-label";
import { RecommendToUserModal, useMyFollowsForRecommend } from "@/components/RecommendToUserModal";
import { AiGeneratedInlineLabel } from "@/components/AiGeneratedInlineLabel";

export type ArticleSocialComment = {
  id: string;
  authorId: string;
  authorNickname: string;
  parentId: string | null;
  body: string;
  createdAt: string;
};

interface Props {
  article: Article;
  showActions?: boolean;
  /** 为 true 时：原抓取摘要移到卡片底部，单行_gray 小字，可点开 >> 展开 */
  collapseOriginalSummary?: boolean;
  /** 随览查看他人书库：隐藏编辑/删除 */
  readOnlyBorrowed?: boolean;
  /** 与 readOnlyBorrowed 配合：他人书库卡片左滑露出「评论」（已读 / 待读均可用） */
  swipeCommentOnly?: boolean;
  articleOwnerIdForSocial?: string;
  socialComments?: ArticleSocialComment[];
  onSocialCommentPosted?: () => void;
  /** 关注用户待读：左滑除评论外，增加「加入我的待读 / 已读」（与 swipeCommentOnly、todo 同用） */
  followPlanActions?: {
    busy: boolean;
    onAddTodo: () => void | Promise<void>;
    onAddDone: () => void | Promise<void>;
  };
}

/** 三钮（评论·已读·待读）露出宽度，与 Browse 双钮比例一致 */
const FOLLOW_TODO_PLAN_SWIPE_REVEAL_PX = 200;
/** 自有待读：推荐 + 已读 */
const OWN_TODO_RECOMMEND_SWIPE_PX = 148;

type DigestMode = "markDone" | "edit";

function formatReadCompletedDateYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

import { hasActiveTextSelection } from "@/lib/text-selection";

function trimmedKeyPoints(points: unknown[] | undefined): string[] {
  return (Array.isArray(points) ? points : []).map((p) => String(p).trim()).filter(Boolean);
}

function ArticleSummaryFooter({
  summary,
  readLead,
  aiGenerated,
}: {
  summary: string;
  readLead?: string;
  aiGenerated?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    if (hasActiveTextSelection()) return;
    setExpanded((v) => !v);
  };
  return (
    <div className="article-summary-footer article-summary-footer-toggle">
      <div className={`article-summary-footer-text ${expanded ? "is-expanded" : "is-collapsed"}`}>
        {aiGenerated ? (
          <>
            <AiGeneratedInlineLabel readLead={readLead} />
            {summary}
          </>
        ) : (
          summary
        )}
      </div>
      <button
        type="button"
        className={`article-summary-footer-chevron ${expanded ? "is-expanded" : ""}`}
        aria-expanded={expanded}
        aria-label={expanded ? "收起原文摘要" : "展开原文摘要"}
        onClick={toggle}
      >
        &gt;&gt;
      </button>
    </div>
  );
}

/** 点击先打开 AI 摘要大弹窗；弹窗内可「查看原文」；长按（约 0.55s）复制链接 */
export function ArticleTitleLink({
  previewCacheNamespaceId,
  url,
  children,
  previewTitle,
  previewSourceText,
  className,
  readSourcesShort: readSourcesShortProp,
}: {
  /** 书库用 article.id；随览等无 id 时用稳定 url */
  previewCacheNamespaceId: string;
  url: string;
  children: ReactNode;
  previewTitle: string;
  previewSourceText: string;
  /** 追加到 `article-title-link` 上，如概述与标题同行为 */
  className?: string;
  /** 读前弹窗「AI生成(读取…)」；缺省由摘要+节选与链接推断 */
  readSourcesShort?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockClickRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadPhase, setLoadPhase] = useState<"query" | "generating">("query");
  const [body, setBody] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [previewSource, setPreviewSource] = useState<ReadPreviewSource | null>(null);
  const [skipReadPreviewClientCache, setSkipReadPreviewClientCache] = useState(false);

  useEffect(() => setMounted(true), []);

  const readSourcesShort =
    readSourcesShortProp?.trim() || buildReadPreviewInputLabel(previewSourceText, url);

  useEffect(() => {
    if (!loading) {
      setLoadPhase("query");
      return;
    }
    setLoadPhase("query");
    const t = window.setTimeout(() => setLoadPhase("generating"), 450);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!previewOpen) {
      setPreviewSource(null);
      setLoading(false);
      setSkipReadPreviewClientCache(false);
      return;
    }
    let cancelled = false;

    if (!skipReadPreviewClientCache) {
      const cached = getReadPreviewUiCache(previewCacheNamespaceId, previewTitle, url, previewSourceText);
      if (cached) {
        setBody(cached.text);
        setShowFallback(cached.showFallback);
        setLoading(false);
        setPreviewSource("client_cache");
        return () => {
          cancelled = true;
        };
      }
    }

    setPreviewSource(null);
    setLoading(true);
    if (!skipReadPreviewClientCache) {
      setBody("");
    }
    setShowFallback(false);
    void fetch("/api/read-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: previewTitle,
        url,
        sourceText: previewSourceText,
        forceRefresh: skipReadPreviewClientCache,
      }),
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          text?: string;
          fallback?: boolean;
          source?: unknown;
          cached?: boolean;
          ai?: boolean;
          readSourcesLabel?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          const fb = fallbackReadModalBody(previewSourceText);
          setBody(fb);
          setShowFallback(true);
          setPreviewSource("fallback");
          setReadPreviewUiCache(
            previewCacheNamespaceId,
            previewTitle,
            url,
            previewSourceText,
            fb,
            true,
            "fallback",
          );
          return;
        }
        const t = typeof d.text === "string" ? d.text : "";
        const fall = Boolean(d.fallback);
        const apiSource = readPreviewSourceFromApiPayload(d);
        setBody(t);
        setShowFallback(fall);
        setPreviewSource(apiSource);
        setReadPreviewUiCache(previewCacheNamespaceId, previewTitle, url, previewSourceText, t, fall, apiSource);
      })
      .catch(() => {
        if (cancelled) return;
        const fb = fallbackReadModalBody(previewSourceText);
        setBody(fb);
        setShowFallback(true);
        setPreviewSource("fallback");
        setReadPreviewUiCache(previewCacheNamespaceId, previewTitle, url, previewSourceText, fb, true, "fallback");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSkipReadPreviewClientCache(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, previewCacheNamespaceId, previewTitle, url, previewSourceText, skipReadPreviewClientCache]);

  function requestReadPreviewForceAi() {
    clearReadPreviewUiCache(previewCacheNamespaceId, previewTitle, url, previewSourceText);
    setSkipReadPreviewClientCache(true);
  }

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
    <>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={["article-title-link", className].filter(Boolean).join(" ")}
        title="点击查看 AI 摘要；长按复制链接"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (blockClickRef.current) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          setPreviewOpen(true);
        }}
      >
        {children}
      </a>
      {mounted ? (
        <ArticleReadPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={previewTitle}
          url={url}
          loading={loading}
          loadPhase={loadPhase}
          previewSource={previewSource}
          readSourcesShort={readSourcesShort}
          bodyText={body}
          showFallbackNote={showFallback}
          showForceAiSummaryLink={
            !loading &&
            (previewSource === "client_cache" ||
              previewSource === "server_cache" ||
              showFallback)
          }
          onForceAiSummary={requestReadPreviewForceAi}
        />
      ) : null}
    </>
  );
}

export function ArticleCard({
  article,
  showActions = true,
  collapseOriginalSummary = false,
  readOnlyBorrowed = false,
  swipeCommentOnly = false,
  articleOwnerIdForSocial,
  socialComments = [],
  onSocialCommentPosted,
  followPlanActions,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestMode, setDigestMode] = useState<DigestMode>("markDone");
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePos, setMorePos] = useState<{ top: number; left: number } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(article.summary || "");
  const [summaryAiBusy, setSummaryAiBusy] = useState(false);
  const [summaryAiErr, setSummaryAiErr] = useState<string | null>(null);
  const [socialCommentOpen, setSocialCommentOpen] = useState(false);
  const [socialDraft, setSocialDraft] = useState("");
  const [socialReplyTo, setSocialReplyTo] = useState<string | null>(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [recommendErr, setRecommendErr] = useState<string | null>(null);

  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePopRef = useRef<HTMLDivElement>(null);

  const followsForRec = useMyFollowsForRecommend();
  const hasRecFollows = followsForRec.length > 0;

  const showActionsEffective = showActions && !readOnlyBorrowed;
  const swipeMarkRead = showActionsEffective && article.status === "todo";
  const ownDoneRecommendSwipe = showActionsEffective && article.status === "done" && hasRecFollows;
  const ownTodoRecDouble = Boolean(swipeMarkRead && hasRecFollows);
  const followTodoPlanSwipe = Boolean(
    readOnlyBorrowed && swipeCommentOnly && article.status === "todo" && followPlanActions,
  );
  const swipeCommentSolo = Boolean(
    readOnlyBorrowed &&
      swipeCommentOnly &&
      (article.status === "done" || (article.status === "todo" && !followPlanActions)),
  );
  const swipeFaceEnabled = swipeMarkRead || swipeCommentSolo || followTodoPlanSwipe || ownDoneRecommendSwipe;
  const swipeRevealPx = followTodoPlanSwipe
    ? FOLLOW_TODO_PLAN_SWIPE_REVEAL_PX
    : ownTodoRecDouble
      ? OWN_TODO_RECOMMEND_SWIPE_PX
      : 76;
  const swipe = useSwipeCardFace(swipeFaceEnabled, swipeRevealPx);

  const [dueDate, setDueDate] = useState(article.dueDate);
  const [theme, setTheme] = useState(article.theme);
  const [author, setAuthor] = useState(article.author || "");
  const [titleEdit, setTitleEdit] = useState(article.title);
  const [titleZhEdit, setTitleZhEdit] = useState(article.titleZh || "");
  const [intensiveRead, setIntensiveRead] = useState(() => isIntensiveRead(article));
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
    setTitleEdit(article.title);
    setTitleZhEdit(article.titleZh || "");
    setIntensiveRead(isIntensiveRead(article));
    setReadOneLiner(article.readOneLiner || "");
    setKp1(article.readKeyPoints?.[0] || "");
    setKp2(article.readKeyPoints?.[1] || "");
    setKp3(article.readKeyPoints?.[2] || "");
    setReadAction(article.readAction || "");
    setSummaryDraft(article.summary || "");
  }, [
    article.id,
    article.dueDate,
    article.theme,
    article.author,
    article.title,
    article.featured,
    article.recommendedDepth,
    article.summary,
    article.titleZh,
    article.language,
    article.readOneLiner,
    article.readAction,
    article.status,
    JSON.stringify(article.readKeyPoints || []),
  ]);

  const digestOneLinerRef = useRef<HTMLTextAreaElement>(null);
  const digestKp1Ref = useRef<HTMLTextAreaElement>(null);
  const digestKp2Ref = useRef<HTMLTextAreaElement>(null);
  const digestKp3Ref = useRef<HTMLTextAreaElement>(null);
  const digestActionRef = useRef<HTMLTextAreaElement>(null);
  const adjustDigestFieldHeights = useCallback(() => {
    for (const r of [digestOneLinerRef, digestKp1Ref, digestKp2Ref, digestKp3Ref, digestActionRef]) {
      const el = r.current;
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${Math.min(320, Math.max(44, el.scrollHeight))}px`;
    }
  }, []);

  useLayoutEffect(() => {
    if (!digestOpen) return;
    adjustDigestFieldHeights();
  }, [digestOpen, readOneLiner, kp1, kp2, kp3, readAction, adjustDigestFieldHeights]);

  const closeMeta = useCallback(() => setMetaOpen(false), []);
  const closeDigest = useCallback(() => setDigestOpen(false), []);
  const closeMore = useCallback(() => {
    setMoreOpen(false);
    setMorePos(null);
  }, []);
  const closeSummary = useCallback(() => {
    setSummaryOpen(false);
    setSummaryAiErr(null);
  }, []);

  useEffect(() => {
    if (metaOpen || digestOpen || moreOpen || summaryOpen || socialCommentOpen || recommendOpen) swipe.resetOffset();
  }, [metaOpen, digestOpen, moreOpen, summaryOpen, socialCommentOpen, recommendOpen, swipe.resetOffset]);

  async function submitRecommendToUser(targetUserId: string) {
    setRecommendBusy(true);
    setRecommendErr(null);
    try {
      const r = await fetch("/api/social/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId, sourceArticleId: article.id }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "推荐失败");
      swipe.resetOffset();
      setRecommendOpen(false);
      alert("已加入对方待读");
      startTransition(() => router.refresh());
    } catch (e) {
      setRecommendErr(e instanceof Error ? e.message : "推荐失败");
    } finally {
      setRecommendBusy(false);
    }
  }

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
    if (!metaOpen && !digestOpen && !summaryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [metaOpen, digestOpen, summaryOpen]);

  useEffect(() => {
    if (!metaOpen && !digestOpen && !summaryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (digestOpen) closeDigest();
        else if (summaryOpen && !summaryAiBusy) closeSummary();
        else if (summaryOpen) {
          /* AI 进行中避免误触关闭 */
        } else closeMeta();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [metaOpen, digestOpen, summaryOpen, summaryAiBusy, closeMeta, closeDigest, closeSummary]);

  function toggleMore(e: React.MouseEvent) {
    e.stopPropagation();
    if (moreOpen) {
      closeMore();
      return;
    }
    const el = moreBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 200;
    setMorePos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
    });
    setMoreOpen(true);
  }

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
    const t = titleEdit.trim();
    if (!t) {
      alert("文章标题不能为空。");
      return;
    }
    const ok = await call("PATCH", {
      title: t,
      titleZh: titleZhEdit.trim(),
      dueDate,
      theme: theme.trim(),
      author: author.trim(),
      featured: intensiveRead,
    });
    if (ok) {
      closeMeta();
      closeMore();
    }
  }

  async function saveSummaryEdit() {
    const s = summaryDraft.trim();
    if (!s) {
      alert("摘要不能为空。");
      return;
    }
    const ok = await call("PATCH", { summary: s });
    if (ok) {
      closeSummary();
      closeMore();
    }
  }

  async function runAiRegenerateSummary() {
    setSummaryAiErr(null);
    setSummaryAiBusy(true);
    try {
      const r = await fetch(`/api/articles/${article.id}/refresh`, { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { article?: Article; error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "AI 生成失败");
      const u = d.article;
      if (!u) throw new Error("未返回文章数据");
      setSummaryDraft(u.summary || "");
      setTitleEdit(u.title);
      setTitleZhEdit(u.titleZh || "");
      setTheme(u.theme);
      setAuthor(u.author || "");
      setDueDate(u.dueDate);
      setIntensiveRead(isIntensiveRead(u));
      startTransition(() => router.refresh());
    } catch (e) {
      setSummaryAiErr(e instanceof Error ? e.message : "生成失败");
    } finally {
      setSummaryAiBusy(false);
    }
  }

  function validateDigest(): boolean {
    const one = readOneLiner.trim();
    const action = readAction.trim();
    if (!one || !action) {
      alert("请填写：一句话总结、1 个行动项（重要观点选填）。");
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
    article.status === "done" && Boolean(article.readOneLiner?.trim()) && Boolean(article.readAction?.trim());

  const cardTop = (
    <div className="article-card-top">
      <div className="meta-row article-card-meta">
        <span
          className={["tag", "theme", article.receivedViaRecommendation ? "theme-from-recommend" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {article.theme}
        </span>
        <span className="tag media-kind">{MEDIA_KIND_LABEL[article.mediaType]}</span>
        <span className={`tag ${isIntensiveRead(article) ? "deep" : "skim"}`}>
          {isIntensiveRead(article) ? "重点精读" : "快速扫览"}
        </span>
        <span>{article.estimatedMinutes} 分钟</span>
      </div>
      {showActionsEffective && (
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

  const hasUsableSummary = Boolean(article.summary && article.summary !== "(暂无摘要)");
  const showSummaryInBody = hasUsableSummary && !collapseOriginalSummary;
  const digestKpTrimmed = trimmedKeyPoints(article.readKeyPoints);
  const readAfterKpProse = digestKpTrimmed.join("；");
  const bookReadLead = resolveArticleAiReadLabel(article);
  const summaryIsAiGenerated = article.summarySource === "ai";
  const readPreviewSourcesShort =
    article.aiReadSourcesLabel?.trim() || buildReadPreviewInputLabel(buildArticlePreviewSource(article), article.url);

  const cardMiddle = (
    <>
      {cardTop}
      <ArticleTitleLink
        previewCacheNamespaceId={article.id}
        url={article.url}
        previewTitle={article.title}
        previewSourceText={buildArticlePreviewSource(article)}
        readSourcesShort={readPreviewSourcesShort}
      >
        <h3 className="title">{article.title}</h3>
      </ArticleTitleLink>
      {article.titleZh?.trim() ? (
        <div className="article-card-source">
          <p className="article-card-title-zh-muted">{article.titleZh}</p>
        </div>
      ) : null}
      <div className="article-card-byline">
        <span className="article-card-byline-author muted-link">作者：{article.author || "未知作者"}</span>
        {article.publishedAt ? (
          <span className="article-card-byline-due muted-link" title="原文首次发布（由 AI 或页面元数据推断）">
            发布 {formatPublishedTimeZh(article.publishedAt)}
          </span>
        ) : null}
        {article.status === "todo" && (
          <span className="article-card-byline-due muted-link" title="预期完成阅读日期">
            预期 {article.dueDate} 读完
          </span>
        )}
        {article.status === "done" && article.completedAt ? (
          <span className="article-card-byline-due muted-link" title="标记为已读的日期">
            已于 {formatReadCompletedDateYmd(article.completedAt)} 读完
          </span>
        ) : null}
      </div>

      {article.status === "todo" && showSummaryInBody && (
        <ArticleTitleLink
          previewCacheNamespaceId={article.id}
          url={article.url}
          previewTitle={article.title}
          previewSourceText={buildArticlePreviewSource(article)}
          readSourcesShort={readPreviewSourcesShort}
          className="article-card-summary-title-link"
        >
          <p className="summary">
            {summaryIsAiGenerated && <AiGeneratedInlineLabel readLead={bookReadLead} />}
            {article.summary}
          </p>
        </ArticleTitleLink>
      )}

      {article.status === "done" && showSummaryInBody && (
        <p className="summary">
          {summaryIsAiGenerated && <AiGeneratedInlineLabel readLead={bookReadLead} />}
          {article.summary}
        </p>
      )}

      {article.status === "done" &&
        collapseOriginalSummary &&
        (digestComplete ? (
          <div className="article-card-read-digest">
            {article.readOneLiner?.trim() ? (
              <p className="article-card-read-summary-line">{article.readOneLiner.trim()}</p>
            ) : null}
            <p className="article-card-read-todo-row">
              <span className="article-card-read-field-label article-card-read-field-label-todo">todo</span>
              <span className="article-card-read-action-value">{article.readAction.trim()}</span>
            </p>
            <div className="article-card-keypoints-block">
              <div className="article-card-read-field-label article-card-keypoints-heading">重要观点：</div>
              {digestKpTrimmed.length > 0 ? (
                <div className="article-card-keypoints-lines">
                  {digestKpTrimmed.map((t, i) => (
                    <p key={i} className="article-card-keypoint-line">
                      {i + 1}. {t}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="article-card-keypoints-placeholder">本文尚未总结重要的3个观点</p>
              )}
            </div>
          </div>
        ) : (
          <p className="muted-link">可从 ⋯ 补全读后笔记。</p>
        ))}

      {article.status === "done" &&
        !collapseOriginalSummary &&
        (digestComplete ? (
          <div className="read-after-stack">
            {article.readOneLiner?.trim() ? (
              <p className="article-card-read-summary-line">{article.readOneLiner.trim()}</p>
            ) : null}
            <div className="article-card-read-field-label article-card-keypoints-heading">重要观点：</div>
            {readAfterKpProse ? (
              <p className="read-after-points">{readAfterKpProse}</p>
            ) : (
              <p className="article-card-keypoints-placeholder">本文尚未总结重要的3个观点</p>
            )}
            <p className="read-after-points read-after-action">{article.readAction}</p>
          </div>
        ) : (
          <p className="muted-link">可从 ⋯ 补全读后笔记。</p>
        ))}

      {collapseOriginalSummary && hasUsableSummary && (
        <ArticleSummaryFooter summary={article.summary} readLead={bookReadLead} aiGenerated={summaryIsAiGenerated} />
      )}

      {readOnlyBorrowed && socialComments.length > 0 ? (
        <div className="article-social-comments" style={{ marginTop: 10 }}>
          {socialComments.map((c) => (
            <div key={c.id} className={`article-social-comment${c.parentId ? " is-reply" : ""}`}>
              <div className="article-social-comment-meta muted-link">
                <strong>{c.authorNickname}</strong>
                <span> · {new Date(c.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              <p className="article-social-comment-body">{c.body}</p>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "2px 8px", fontSize: "var(--fs-small)", marginTop: 4 }}
                onClick={() => {
                  setSocialReplyTo(c.id);
                  setSocialDraft("");
                  setSocialCommentOpen(true);
                }}
              >
                回复
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
            <label className="muted-link">文章标题</label>
            <input
              className="input"
              value={titleEdit}
              onChange={(e) => setTitleEdit(e.target.value)}
              placeholder="文章标题"
              aria-label="文章标题"
            />
            <label className="muted-link">中文标题（可选）</label>
            <input
              className="input"
              value={titleZhEdit}
              onChange={(e) => setTitleZhEdit(e.target.value)}
              placeholder="英文稿时的中文译名，可留空"
              aria-label="中文标题"
            />
            {article.status === "todo" && (
              <>
                <label className="muted-link">期望完成阅读时间</label>
                <div className="add-form-date-wrap">
                  <input
                    className="input"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    aria-label="期望完成阅读时间"
                  />
                </div>
              </>
            )}
            <label className="muted-link">作者</label>
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="作者" />
            <label className="muted-link">主题标签</label>
            <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="主题标签" />
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
          <h2 id="article-digest-modal-title">{digestMode === "markDone" ? "标记已读" : "编辑读后笔记"}</h2>
          <button type="button" className="modal-sheet-close" onClick={closeDigest} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-sheet-body">
          <div className="row">
            <label className="muted-link" htmlFor="article-digest-oneliner">
              一句话总结
            </label>
            <textarea
              id="article-digest-oneliner"
              ref={digestOneLinerRef}
              className="input textarea-input article-digest-oneliner-textarea"
              rows={1}
              value={readOneLiner}
              onChange={(e) => setReadOneLiner(e.target.value)}
              placeholder="用一两句话概括你从文中带走的核心信息（支持多行）"
            />
            <label className="muted-link" htmlFor="article-digest-kp1">
              3 个重要观点（选填）
            </label>
            <textarea
              id="article-digest-kp1"
              ref={digestKp1Ref}
              className="input textarea-input article-digest-oneliner-textarea"
              rows={1}
              value={kp1}
              onChange={(e) => setKp1(e.target.value)}
              placeholder="选填：第 1 条观点，可留空（支持多行）"
            />
            <textarea
              id="article-digest-kp2"
              ref={digestKp2Ref}
              className="input textarea-input article-digest-oneliner-textarea"
              rows={1}
              value={kp2}
              onChange={(e) => setKp2(e.target.value)}
              placeholder="选填：第 2 条观点，可留空（支持多行）"
            />
            <textarea
              id="article-digest-kp3"
              ref={digestKp3Ref}
              className="input textarea-input article-digest-oneliner-textarea"
              rows={1}
              value={kp3}
              onChange={(e) => setKp3(e.target.value)}
              placeholder="选填：第 3 条观点，可留空（支持多行）"
            />
            <label className="muted-link" htmlFor="article-digest-action">
              1 个行动项
            </label>
            <textarea
              id="article-digest-action"
              ref={digestActionRef}
              className="input textarea-input article-digest-oneliner-textarea"
              rows={1}
              value={readAction}
              onChange={(e) => setReadAction(e.target.value)}
              placeholder="你打算在工作中具体做什么（支持多行）"
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

  const summaryModal = mounted && summaryOpen && (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !summaryAiBusy && closeSummary()}
    >
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-summary-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-sheet-header">
          <h2 id="article-summary-modal-title">修改文章摘要</h2>
          <button type="button" className="modal-sheet-close" onClick={() => !summaryAiBusy && closeSummary()} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-sheet-body">
          <div className="row">
            <label className="muted-link">摘要（保存后同步到待读/已读卡片）</label>
            <textarea
              className="input textarea-input"
              rows={6}
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              placeholder="手动校对或改写自动摘要…"
              aria-label="文章摘要"
              disabled={busy || summaryAiBusy}
            />
          </div>
          <p className="muted-link" style={{ fontSize: "var(--fs-small)", margin: "10px 0 8px" }}>
            「AI生成摘要」会重新抓取原文并用 AI 生成摘要、主题等信息（与添加文章时一致）；成功后填入上方，你可再编辑后点保存。
          </p>
          {summaryAiErr ? <p className="me-msg">{summaryAiErr}</p> : null}
          <button
            type="button"
            className="btn secondary"
            disabled={busy || summaryAiBusy}
            onClick={() => void runAiRegenerateSummary()}
          >
            {summaryAiBusy ? "AI 生成中…" : "AI生成摘要"}
          </button>
        </div>
        <div className="modal-sheet-footer">
          <button className="btn secondary" type="button" disabled={busy || summaryAiBusy} onClick={saveSummaryEdit}>
            保存
          </button>
          <button className="btn secondary" type="button" disabled={busy || summaryAiBusy} onClick={closeSummary}>
            取消
          </button>
        </div>
      </div>
    </div>
  );

  async function submitSocialComment() {
    const body = socialDraft.trim();
    if (!body || !articleOwnerIdForSocial) return;
    setBusy(true);
    try {
      const r = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          articleId: article.id,
          articleOwnerId: articleOwnerIdForSocial,
          parentId: socialReplyTo,
          body,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "发送失败");
      setSocialCommentOpen(false);
      setSocialDraft("");
      setSocialReplyTo(null);
      onSocialCommentPosted?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  const socialCommentModal =
    mounted && socialCommentOpen ? (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && !busy && setSocialCommentOpen(false)}
      >
        <div className="modal-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="modal-sheet-header">
            <h2>{socialReplyTo ? "回复评论" : "发表评论"}</h2>
            <button type="button" className="modal-sheet-close" onClick={() => !busy && setSocialCommentOpen(false)}>
              ×
            </button>
          </div>
          <div className="modal-sheet-body">
            <textarea
              className="input textarea-input"
              rows={4}
              value={socialDraft}
              onChange={(e) => setSocialDraft(e.target.value)}
              placeholder="写下你的想法…"
            />
          </div>
          <div className="modal-sheet-footer">
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void submitSocialComment()}>
              发送
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const moreMenu =
    mounted && showActionsEffective && moreOpen && morePos
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
                setSummaryDraft(article.summary || "");
                setSummaryAiErr(null);
                closeMore();
                setSummaryOpen(true);
              }}
            >
              修改摘要
            </button>
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

  if (swipeFaceEnabled) {
    return (
      <>
        <div className="article-swipe-host">
          <div
            className={
              followTodoPlanSwipe
                ? "article-swipe-underlay article-swipe-underlay--triple"
                : ownTodoRecDouble ? "article-swipe-underlay article-swipe-underlay--double" : "article-swipe-underlay"
            }
            aria-hidden
          >
            {followTodoPlanSwipe && followPlanActions ? (
              <>
                <button
                  type="button"
                  className="article-swipe-comment-circle"
                  disabled={followPlanActions.busy}
                  onClick={() => {
                    swipe.resetOffset();
                    setSocialReplyTo(null);
                    setSocialDraft("");
                    setSocialCommentOpen(true);
                  }}
                  aria-label="评论"
                >
                  评论
                </button>
                <button
                  type="button"
                  className="article-swipe-read-circle"
                  disabled={followPlanActions.busy}
                  onClick={() => {
                    swipe.resetOffset();
                    void followPlanActions.onAddDone();
                  }}
                  aria-label="加入我的已读"
                >
                  已读
                </button>
                <button
                  type="button"
                  className="article-swipe-todo-circle"
                  disabled={followPlanActions.busy}
                  onClick={() => {
                    swipe.resetOffset();
                    void followPlanActions.onAddTodo();
                  }}
                  aria-label="加入我的待读"
                >
                  待读
                </button>
              </>
            ) : swipeCommentSolo ? (
              <button
                type="button"
                className="article-swipe-read-circle"
                onClick={() => {
                  swipe.resetOffset();
                  setSocialReplyTo(null);
                  setSocialDraft("");
                  setSocialCommentOpen(true);
                }}
                aria-label="评论"
              >
                评论
              </button>
            ) : ownTodoRecDouble ? (
              <>
                <button
                  type="button"
                  className="article-swipe-comment-circle"
                  onClick={() => {
                    swipe.resetOffset();
                    setRecommendErr(null);
                    setRecommendOpen(true);
                  }}
                  aria-label="推荐 TA 读"
                >
                  推荐
                </button>
                <button type="button" className="article-swipe-read-circle" onClick={openMarkReadFromSwipe} aria-label="标记已读">
                  已读
                </button>
              </>
            ) : ownDoneRecommendSwipe ? (
              <button
                type="button"
                className="article-swipe-comment-circle"
                onClick={() => {
                  swipe.resetOffset();
                  setRecommendErr(null);
                  setRecommendOpen(true);
                }}
                aria-label="推荐 TA 读"
              >
                推荐
              </button>
            ) : (
              <button type="button" className="article-swipe-read-circle" onClick={openMarkReadFromSwipe} aria-label="标记已读">
                已读
              </button>
            )}
          </div>
          <article
            className="article-card article-swipe-face"
            style={swipe.style}
            onTouchStart={swipe.onTouchStart}
            onTouchMove={swipe.onTouchMove}
            onTouchEnd={swipe.onTouchEnd}
            onMouseDown={swipe.onMouseDown}
            onClickCapture={swipe.onClickCapture}
          >
            {cardMiddle}
          </article>
        </div>
        {moreMenu}
        {metaModal && createPortal(metaModal, document.body)}
        {digestModal && createPortal(digestModal, document.body)}
        {summaryModal && createPortal(summaryModal, document.body)}
        {socialCommentModal && createPortal(socialCommentModal, document.body)}
        {mounted
          ? createPortal(
              <RecommendToUserModal
                open={recommendOpen}
                articleTitle={article.title}
                busy={recommendBusy}
                error={recommendErr}
                follows={followsForRec}
                alreadySentTo={article.recommendSentTo}
                onClose={() => !recommendBusy && setRecommendOpen(false)}
                onConfirm={(id) => void submitRecommendToUser(id)}
              />,
              document.body,
            )
          : null}
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
      {summaryModal && createPortal(summaryModal, document.body)}
      {socialCommentModal && createPortal(socialCommentModal, document.body)}
    </>
  );
}
