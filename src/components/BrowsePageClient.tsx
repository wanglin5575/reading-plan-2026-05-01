"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BrowseHit, BrowseTopic } from "@/lib/types";
import {
  loadBrowseStorage,
  mergeBrowseFeed,
  mergeBrowseTopicFeeds,
  saveBrowseStorage,
  pruneBrowseItems,
  sortBrowseItemsForDisplay,
  BROWSE_BOOTSTRAP_SINCE_MS,
  BROWSE_EXCLUDE_URLS_MAX,
  BROWSE_SORT_LS_KEY,
  type BrowseSortMode,
  type BrowseStoredHit,
  type BrowseTopicFeed,
} from "@/lib/browse-storage";
import { BrowseHitCard } from "@/components/BrowseHitCard";

function TopicTabButton({
  t,
  active,
  onSelect,
  onLongPress,
}: {
  t: BrowseTopic;
  active: boolean;
  onSelect: (id: string) => void;
  onLongPress: (topic: BrowseTopic) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longConsumedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      className={`browse-topic-tab ${active ? "active" : ""}`}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        longConsumedRef.current = false;
        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          longConsumedRef.current = true;
          onLongPress(t);
        }, 550);
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      onClick={() => {
        if (longConsumedRef.current) {
          longConsumedRef.current = false;
          return;
        }
        onSelect(t.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress(t);
      }}
    >
      {t.name}
    </button>
  );
}

export default function BrowsePageClient() {
  const [topics, setTopics] = useState<BrowseTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hits, setHits] = useState<BrowseStoredHit[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKw, setNewKw] = useState("");
  const [editTopic, setEditTopic] = useState<BrowseTopic | null>(null);
  const [editKw, setEditKw] = useState("");
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [markDoneOpen, setMarkDoneOpen] = useState(false);
  const [markDoneHit, setMarkDoneHit] = useState<BrowseStoredHit | null>(null);
  const [rdOne, setRdOne] = useState("");
  const [rdK1, setRdK1] = useState("");
  const [rdK2, setRdK2] = useState("");
  const [rdK3, setRdK3] = useState("");
  const [rdAction, setRdAction] = useState("");
  const [sortBy, setSortBy] = useState<BrowseSortMode>("refreshed");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortDdRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const refreshingRef = useRef(false);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  const loadTopics = useCallback(async () => {
    setLoadingTopics(true);
    setMsg(null);
    try {
      const r = await fetch("/api/browse/topics", { cache: "no-store" });
      const d = (await r.json()) as { topics?: BrowseTopic[]; error?: string };
      if (!r.ok) throw new Error(d.error || "加载失败");
      const list = d.topics ?? [];
      setTopics(list);
      setActiveId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    setMounted(true);
    const v = typeof window !== "undefined" ? localStorage.getItem(BROWSE_SORT_LS_KEY) : null;
    if (v === "published" || v === "refreshed") setSortBy(v);
  }, []);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (sortDdRef.current && !sortDdRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sortMenuOpen]);

  useEffect(() => {
    setSortMenuOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(BROWSE_SORT_LS_KEY, sortBy);
  }, [sortBy]);

  const pushTopicFeedToServer = useCallback(async (topicId: string, feed: BrowseTopicFeed) => {
    try {
      const r = await fetch("/api/browse/feed", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId, feed }),
      });
      if (!r.ok && r.status !== 503) {
        console.warn("[browse] 同步到服务端失败", r.status);
      }
    } catch {
      /* 离线：仅本机仍可用 */
    }
  }, []);

  const syncFeedWithServer = useCallback(async (topicId: string) => {
    if (!topicId) return;
    const store = loadBrowseStorage();
    let localFeed = store.topics[topicId] ?? { lastRefreshAt: null, items: [] };
    const pruned = pruneBrowseItems(localFeed.items);
    if (pruned.length !== localFeed.items.length) {
      localFeed = { ...localFeed, items: pruned };
      store.topics[topicId] = localFeed;
      saveBrowseStorage(store);
    }
    if (activeIdRef.current === topicId) setHits(localFeed.items);

    try {
      const r = await fetch(`/api/browse/feed?topicId=${encodeURIComponent(topicId)}`, {
        cache: "no-store",
      });
      if (r.status === 503) return;
      if (!r.ok) return;
      const d = (await r.json()) as { feed?: BrowseTopicFeed };
      if (!d.feed) return;
      const mergedH = mergeBrowseTopicFeeds(localFeed, d.feed);
      store.topics[topicId] = mergedH;
      saveBrowseStorage(store);
      if (activeIdRef.current === topicId) setHits(mergedH.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!activeId) {
      setHits([]);
      return;
    }
    void syncFeedWithServer(activeId);
  }, [activeId, syncFeedWithServer]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const id = activeIdRef.current;
      if (id) void syncFeedWithServer(id);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [syncFeedWithServer]);

  const runRefresh = useCallback(async (topicId: string) => {
    if (!topicId || refreshingRef.current) return;
    setRefreshing(true);
    setMsg(null);
    try {
      const store = loadBrowseStorage();
      const feed = store.topics[topicId] ?? { lastRefreshAt: null, items: [] };
      const isBootstrap = feed.lastRefreshAt == null;
      const sinceIso = isBootstrap
        ? new Date(Date.now() - BROWSE_BOOTSTRAP_SINCE_MS).toISOString()
        : (feed.lastRefreshAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const sinceMs = Date.parse(sinceIso);

      const excludeUrls = isBootstrap
        ? []
        : feed.items.map((x) => x.url).slice(0, BROWSE_EXCLUDE_URLS_MAX);

      const r = await fetch("/api/browse/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicId,
          since: sinceIso,
          bootstrap: isBootstrap,
          excludeUrls,
        }),
      });
      const d = (await r.json()) as {
        hits?: BrowseHit[];
        fetchedAt?: string;
        error?: string;
        skippedKnown?: number;
      };
      if (!r.ok) throw new Error(d.error || "检索失败");

      const fetchedAt = d.fetchedAt ?? new Date().toISOString();
      const merged = mergeBrowseFeed(feed, d.hits ?? [], fetchedAt, sinceMs);
      store.topics[topicId] = merged;
      saveBrowseStorage(store);
      await pushTopicFeedToServer(topicId, merged);

      if (activeIdRef.current === topicId) {
        setHits(merged.items);
      }

      if ((d.hits?.length ?? 0) > 0) {
        setMsg(null);
      } else if ((d.skippedKnown ?? 0) > 0) {
        setMsg("本次无新增链接；已跳过已有网址，未做重复翻译。");
      } else {
        setMsg("本次未发现新结果，可改日再试或调整关键词。");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "检索失败");
    } finally {
      setRefreshing(false);
    }
  }, [pushTopicFeedToServer]);

  useEffect(() => {
    const scrollTop = () => {
      const el = document.scrollingElement ?? document.documentElement;
      return Math.max(0, window.scrollY ?? window.pageYOffset ?? el.scrollTop ?? 0);
    };

    const isPullTargetBlocked = (target: EventTarget | null) => {
      if (!target || !(target instanceof Element)) return true;
      return !!target.closest(
        "button, a, input, textarea, select, label, [role='button'], [role='dialog'], .browse-modal-backdrop",
      );
    };

    let startY = 0;
    let pulling = false;
    let activePointerId: number | null = null;
    const pullAcc = { v: 0 };
    const SCROLL_EPS = 1;
    /** 仅页面在顶部时可下拉；用 Pointer 统一支持触屏与鼠标拖拽 */

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (isPullTargetBlocked(e.target)) return;
      if (scrollTop() > SCROLL_EPS) return;
      pulling = true;
      activePointerId = e.pointerId;
      startY = e.clientY;
      pullAcc.v = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pulling || activePointerId !== e.pointerId) return;
      if (scrollTop() > SCROLL_EPS) {
        pulling = false;
        activePointerId = null;
        pullAcc.v = 0;
        setPullPx(0);
        return;
      }
      const dy = e.clientY - startY;
      if (dy > 0) {
        e.preventDefault();
        pullAcc.v = Math.min(80, dy * 0.45);
        setPullPx(pullAcc.v);
      }
    };

    const endPointer = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;
      if (!pulling) return;
      pulling = false;
      const px = pullAcc.v;
      pullAcc.v = 0;
      setPullPx(0);
      const id = activeIdRef.current;
      if (px >= 48 && id) void runRefresh(id);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
    };
  }, [runRefresh]);

  async function onAddTopic(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const keywords = newKw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name || !keywords.length) {
      setMsg("请填写主题名和关键词（可用中英文逗号分隔）");
      return;
    }
    try {
      const r = await fetch("/api/browse/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, keywords }),
      });
      const d = (await r.json()) as { topic?: BrowseTopic; error?: string };
      if (!r.ok) throw new Error(d.error || "添加失败");
      setFormOpen(false);
      setNewName("");
      setNewKw("");
      await loadTopics();
      if (d.topic?.id) setActiveId(d.topic.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    }
  }

  function openEditTopic(t: BrowseTopic) {
    setEditTopic(t);
    setEditKw(t.keywords.join(", "));
    setMsg(null);
  }

  async function saveEditKeywords() {
    if (!editTopic) return;
    const keywords = editKw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!keywords.length) {
      setMsg("至少保留一个关键词");
      return;
    }
    try {
      const r = await fetch(`/api/browse/topics/${editTopic.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "保存失败");
      setEditTopic(null);
      await loadTopics();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function deleteEditTopic() {
    if (!editTopic) return;
    if (!confirm(`删除主题「${editTopic.name}」？本地列表缓存也会清空。`)) return;
    const id = editTopic.id;
    try {
      const r = await fetch(`/api/browse/topics/${id}`, { method: "DELETE" });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "删除失败");
      const store = loadBrowseStorage();
      delete store.topics[id];
      saveBrowseStorage(store);
      setEditTopic(null);
      await loadTopics();
      const tr = await fetch("/api/browse/topics", { cache: "no-store" });
      const td = (await tr.json()) as { topics?: BrowseTopic[]; error?: string };
      if (!tr.ok) throw new Error(td.error || "加载主题失败");
      const freshList = td.topics ?? [];
      const nextId = freshList[0]?.id ?? null;
      setActiveId(nextId);
      activeIdRef.current = nextId;
      const storeAfter = loadBrowseStorage();
      const nextHits = nextId ? (storeAfter.topics[nextId]?.items ?? []) : [];
      setHits(nextHits);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "删除失败");
    }
  }

  function openBrowseMarkDone(hit: BrowseStoredHit) {
    setMarkDoneHit(hit);
    setRdOne("");
    setRdK1("");
    setRdK2("");
    setRdK3("");
    setRdAction("");
    setMarkDoneOpen(true);
    setMsg(null);
  }

  function closeBrowseMarkDone() {
    if (busyUrl) return;
    setMarkDoneOpen(false);
    setMarkDoneHit(null);
  }

  async function addHitToPlanTodo(hit: BrowseStoredHit) {
    if (busyUrl) return;
    setBusyUrl(hit.url);
    setMsg(null);
    try {
      const r = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: hit.url,
          quickDone: false,
          browseTopicName: active?.name ?? "",
        }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "添加失败");
      setMsg("已加入待读");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusyUrl(null);
    }
  }

  async function submitBrowseMarkDone() {
    const hit = markDoneHit;
    if (!hit || busyUrl) return;
    const one = rdOne.trim();
    const action = rdAction.trim();
    const points = [rdK1.trim(), rdK2.trim(), rdK3.trim()];
    if (!one || !action || points.some((p) => !p)) {
      setMsg("请填写完整读后笔记：一句话总结、3 条观点、1 个行动项。");
      return;
    }
    setBusyUrl(hit.url);
    setMsg(null);
    try {
      const r = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: hit.url,
          quickDone: true,
          browseTopicName: active?.name ?? "",
          readOneLiner: one,
          readKeyPoints: points,
          readAction: action,
        }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "添加失败");
      setMsg("已加入已读");
      setMarkDoneOpen(false);
      setMarkDoneHit(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusyUrl(null);
    }
  }

  const active = topics.find((t) => t.id === activeId);

  const sortedHits = useMemo(() => sortBrowseItemsForDisplay(hits, sortBy), [hits, sortBy]);

  const showPullVisual = pullPx > 4 || refreshing;
  const pullProgress = refreshing ? 1 : Math.min(1, pullPx / 48);

  return (
    <>
      <header className="app-header browse-header-row">
        <div className="app-header-titles">
          <h1
            className="browse-title-refresh"
            title="双击刷新当前主题列表（与下拉刷新相同）"
            onDoubleClick={() => {
              if (loadingTopics || !activeId || refreshingRef.current) return;
              void runRefresh(activeId);
            }}
          >
            随览
          </h1>
          <span className="sub">
            首次刷新约 6 个月窗、增量只补新链接；自首次收录起约保留 90 天。
          </span>
        </div>
      </header>

      <div
        className="browse-pull-rail"
        style={{
          minHeight: showPullVisual ? Math.max(pullPx, refreshing ? 44 : pullPx) : 0,
        }}
        aria-hidden
      >
        {showPullVisual ? (
          <span
            className={`browse-pull-icon ${refreshing || pullProgress >= 1 ? "browse-pull-icon--active" : ""} ${
              refreshing ? "browse-pull-icon--spin" : ""
            }`}
            style={
              refreshing
                ? undefined
                : { transform: `rotate(${pullProgress * 220}deg)`, display: "inline-block" }
            }
          >
            ↻
          </span>
        ) : null}
      </div>

      <div className="browse-topic-tabs">
        {loadingTopics ? (
          <span className="muted-link">加载主题…</span>
        ) : (
          <>
            {topics.map((t) => (
              <TopicTabButton
                key={t.id}
                t={t}
                active={t.id === activeId}
                onSelect={setActiveId}
                onLongPress={openEditTopic}
              />
            ))}
            <button
              type="button"
              className="browse-topic-tab browse-topic-tab-add"
              aria-label="添加主题"
              onClick={() => setFormOpen(true)}
            >
              +
            </button>
          </>
        )}
      </div>

      {active && (
        <div className="browse-kw-row">
          <p className="muted-link browse-kw-line browse-kw-main">
            关键词：<span className="browse-kw-chips">{active.keywords.join(" · ")}</span>
          </p>
          {!loadingTopics ? (
            <div className="browse-sort-dd" ref={sortDdRef}>
              <button
                type="button"
                className="browse-sort-dd-trigger"
                aria-haspopup="listbox"
                aria-expanded={sortMenuOpen}
                aria-label="排序方式"
                onClick={() => setSortMenuOpen((o) => !o)}
              >
                <span className="browse-sort-dd-label">
                  {sortBy === "refreshed" ? "按刷新时间" : "按发布时间"}
                </span>
                <span className={`browse-sort-dd-chevron${sortMenuOpen ? " browse-sort-dd-chevron--open" : ""}`} aria-hidden />
              </button>
              {sortMenuOpen ? (
                <ul className="browse-sort-dd-menu" role="listbox" aria-label="选择排序">
                  <li role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={sortBy === "refreshed"}
                      className={`browse-sort-dd-item${sortBy === "refreshed" ? " browse-sort-dd-item--on" : ""}`}
                      onClick={() => {
                        setSortBy("refreshed");
                        setSortMenuOpen(false);
                      }}
                    >
                      按刷新时间
                    </button>
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={sortBy === "published"}
                      className={`browse-sort-dd-item${sortBy === "published" ? " browse-sort-dd-item--on" : ""}`}
                      onClick={() => {
                        setSortBy("published");
                        setSortMenuOpen(false);
                      }}
                    >
                      按发布时间
                    </button>
                  </li>
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {msg && <p className="me-msg browse-msg">{msg}</p>}

      {editTopic && (
        <div
          className="browse-modal-backdrop"
          role="presentation"
          onClick={() => setEditTopic(null)}
        >
          <div
            className="card browse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="browse-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="browse-edit-title">编辑主题 · {editTopic.name}</h2>
            <label className="muted-link" htmlFor="browse-edit-kw">
              关键词（与主题为且，多项为或；逗号分隔）
            </label>
            <input
              id="browse-edit-kw"
              className="input"
              value={editKw}
              onChange={(e) => setEditKw(e.target.value)}
              placeholder="Hamel, Shreya, …"
            />
            <div className="browse-form-actions">
              <button className="btn" type="button" onClick={() => void saveEditKeywords()}>
                保存
              </button>
              <button className="btn danger" type="button" onClick={() => void deleteEditTopic()}>
                删除主题
              </button>
              <button type="button" className="btn secondary" onClick={() => setEditTopic(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="card browse-form-card">
          <h2>添加主题</h2>
          <form className="row" onSubmit={onAddTopic}>
            <label className="muted-link" htmlFor="browse-new-name">
              主题名称
            </label>
            <input
              id="browse-new-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="如 AI Evals"
            />
            <label className="muted-link" htmlFor="browse-new-kw">
              关键词（与主题为且，多项为或；逗号分隔）
            </label>
            <input
              id="browse-new-kw"
              className="input"
              value={newKw}
              onChange={(e) => setNewKw(e.target.value)}
              placeholder="Hamel, Shreya, Stella&Amy, Anthropic"
            />
            <div className="browse-form-actions">
              <button className="btn" type="submit">
                保存
              </button>
              <button type="button" className="btn secondary" onClick={() => setFormOpen(false)}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="browse-hits">
        {!loadingTopics && activeId && hits.length === 0 ? (
          <div className="browse-empty-center">
            <button
              type="button"
              className="browse-empty-refresh-btn"
              disabled={refreshing}
              aria-busy={refreshing}
              aria-label={refreshing ? "正在刷新" : "点击刷新列表"}
              onClick={() => {
                if (!activeId || refreshingRef.current) return;
                void runRefresh(activeId);
              }}
            >
              <span
                className={`browse-empty-refresh-icon${refreshing ? " browse-empty-refresh-icon--spin" : ""}`}
                aria-hidden
              >
                ↻
              </span>
            </button>
          </div>
        ) : null}
        {sortedHits.map((h) => (
          <BrowseHitCard
            key={h.url}
            hit={h}
            topicName={active?.name ?? "—"}
            busy={busyUrl === h.url}
            onAddTodo={() => addHitToPlanTodo(h)}
            onAddDone={async () => {
              openBrowseMarkDone(h);
            }}
          />
        ))}
      </div>
      {mounted && markDoneOpen && markDoneHit
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeBrowseMarkDone();
              }}
            >
              <div
                className="modal-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="browse-mark-done-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-sheet-header">
                  <h2 id="browse-mark-done-title">加入已读（必填读后笔记）</h2>
                  <button
                    type="button"
                    className="modal-sheet-close"
                    onClick={closeBrowseMarkDone}
                    disabled={busyUrl !== null}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
                  {markDoneHit.title}
                </p>
                <div className="modal-sheet-body">
                  <div className="row">
                    <label className="muted-link" htmlFor="browse-rd-one">
                      一句话总结
                    </label>
                    <input
                      id="browse-rd-one"
                      className="input"
                      value={rdOne}
                      onChange={(e) => setRdOne(e.target.value)}
                      placeholder="用一句话概括你从文中带走的核心信息"
                      disabled={busyUrl !== null}
                    />
                    <label className="muted-link" htmlFor="browse-rd-k1">
                      3 个重要观点
                    </label>
                    <input
                      id="browse-rd-k1"
                      className="input"
                      value={rdK1}
                      onChange={(e) => setRdK1(e.target.value)}
                      placeholder="观点 1"
                      disabled={busyUrl !== null}
                    />
                    <input
                      className="input"
                      value={rdK2}
                      onChange={(e) => setRdK2(e.target.value)}
                      placeholder="观点 2"
                      disabled={busyUrl !== null}
                    />
                    <input
                      className="input"
                      value={rdK3}
                      onChange={(e) => setRdK3(e.target.value)}
                      placeholder="观点 3"
                      disabled={busyUrl !== null}
                    />
                    <label className="muted-link" htmlFor="browse-rd-action">
                      1 个行动项
                    </label>
                    <input
                      id="browse-rd-action"
                      className="input"
                      value={rdAction}
                      onChange={(e) => setRdAction(e.target.value)}
                      placeholder="你打算在工作中具体做什么"
                      disabled={busyUrl !== null}
                    />
                  </div>
                </div>
                <div className="modal-sheet-footer">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busyUrl !== null}
                    onClick={() => void submitBrowseMarkDone()}
                  >
                    {busyUrl ? "提交中…" : "确认加入已读"}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busyUrl !== null}
                    onClick={closeBrowseMarkDone}
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
