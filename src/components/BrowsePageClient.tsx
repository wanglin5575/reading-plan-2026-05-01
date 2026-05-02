"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BrowseAiRejectedItem, BrowseHit, BrowseTopic } from "@/lib/types";
import {
  loadBrowseStorage,
  loadBrowseAiRejectedMap,
  mergeBrowseFeed,
  mergeBrowseTopicFeeds,
  saveBrowseStorage,
  saveBrowseAiRejectedMap,
  pruneBrowseItems,
  sortBrowseItemsForDisplay,
  BROWSE_BOOTSTRAP_SINCE_MS,
  BROWSE_EXCLUDE_URLS_MAX,
  BROWSE_SORT_LS_KEY,
  type BrowseSortMode,
  type BrowseStoredHit,
  type BrowseTopicFeed,
} from "@/lib/browse-storage";
import { filterBrowseHitsByPublishedAge, effectiveMaxPublishedAgeDays } from "@/lib/browse-recency";
import { BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS } from "@/lib/browse-defaults";
import { BrowseHitCard } from "@/components/BrowseHitCard";
import { createBrowseUiDemoHit, isBrowseUiDemoHit } from "@/lib/browse-demo-preview";

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
  const [editSeeds, setEditSeeds] = useState("");
  const [editMaxAge, setEditMaxAge] = useState("");
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [autoPulling, setAutoPulling] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [markDoneOpen, setMarkDoneOpen] = useState(false);
  const [markDoneHit, setMarkDoneHit] = useState<BrowseStoredHit | null>(null);
  const [rdOne, setRdOne] = useState("");
  const [rdK1, setRdK1] = useState("");
  const [rdK2, setRdK2] = useState("");
  const [rdK3, setRdK3] = useState("");
  const [rdAction, setRdAction] = useState("");
  const [sortBy, setSortBy] = useState<BrowseSortMode>("published");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [aiRejectedOpen, setAiRejectedOpen] = useState(false);
  const [aiRejectedList, setAiRejectedList] = useState<BrowseAiRejectedItem[]>([]);
  const sortDdRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const autoPullRafRef = useRef<number | null>(null);
  const autoPullBusyRef = useRef(false);
  useEffect(() => {
    activeIdRef.current = activeId;
    setAutoPulling(false);
    autoPullBusyRef.current = false;
    setPullPx(0);
    if (autoPullRafRef.current != null) {
      cancelAnimationFrame(autoPullRafRef.current);
      autoPullRafRef.current = null;
    }
  }, [activeId]);

  useEffect(() => {
    if (!activeId || typeof window === "undefined") {
      setAiRejectedList([]);
      return;
    }
    const map = loadBrowseAiRejectedMap();
    setAiRejectedList(map[activeId] ?? []);
  }, [activeId]);

  useEffect(() => {
    return () => {
      if (autoPullRafRef.current != null) cancelAnimationFrame(autoPullRafRef.current);
    };
  }, []);

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

  const executeTopicNetworkRefresh = useCallback(async (topicId: string) => {
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
      aiRejected?: BrowseAiRejectedItem[];
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

    const rej = Array.isArray(d.aiRejected) ? d.aiRejected : [];
    if (typeof window !== "undefined") {
      const rmap = loadBrowseAiRejectedMap();
      rmap[topicId] = rej;
      saveBrowseAiRejectedMap(rmap);
      if (activeIdRef.current === topicId) setAiRejectedList(rej);
    }

    return {
      merged,
      hitCount: d.hits?.length ?? 0,
      skippedKnown: d.skippedKnown ?? 0,
    };
  }, [pushTopicFeedToServer]);

  const runRefresh = useCallback(
    async (topicId: string) => {
      if (!topicId || refreshingRef.current) return;
      setRefreshing(true);
      setMsg(null);
      try {
        const { merged, hitCount, skippedKnown } = await executeTopicNetworkRefresh(topicId);
        if (activeIdRef.current === topicId) {
          setHits(merged.items);
        }
        if (hitCount > 0) {
          setMsg(null);
        } else if (skippedKnown > 0) {
          setMsg("本次无新增链接；已跳过已有网址，未做重复翻译。");
        } else {
          setMsg("本次未发现新结果，可改日再试或调整关键词。");
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "检索失败");
      } finally {
        setRefreshing(false);
      }
    },
    [executeTopicNetworkRefresh],
  );

  /** 双击「随览」标题：重置当前主题（清空本地与服务端随览缓存，下次下拉按首次规则重新拉取） */
  const resetActiveTopic = useCallback(async () => {
    const cur = activeIdRef.current;
    if (!cur || refreshingRef.current || loadingTopics) return;
    setRefreshing(true);
    setMsg(null);
    try {
      const store = loadBrowseStorage();
      const next = { ...store, topics: { ...store.topics } };
      delete next.topics[cur];
      saveBrowseStorage(next);

      const rj = loadBrowseAiRejectedMap();
      delete rj[cur];
      saveBrowseAiRejectedMap(rj);
      setAiRejectedList([]);

      const r = await fetch(`/api/browse/topics/${encodeURIComponent(cur)}/reset`, { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!r.ok) throw new Error(d.error || "重置失败");

      setHits([]);
      setMsg("已重置当前主题：缓存已清空，下拉刷新将按「首次」规则重新拉取（约近 3 个月窗）。");
      void syncFeedWithServer(cur);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "重置失败");
    } finally {
      setRefreshing(false);
    }
  }, [loadingTopics, syncFeedWithServer]);

  const startEmptyRefreshWithPull = useCallback(
    (topicId: string) => {
      if (!topicId || refreshingRef.current || autoPullBusyRef.current) return;
      autoPullBusyRef.current = true;
      setAutoPulling(true);
      const duration = 280;
      const target = 56;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) * (1 - t);
        setPullPx(target * eased);
        if (t < 1) {
          autoPullRafRef.current = requestAnimationFrame(tick);
        } else {
          autoPullRafRef.current = null;
          setPullPx(0);
          autoPullBusyRef.current = false;
          setAutoPulling(false);
          if (activeIdRef.current === topicId) void runRefresh(topicId);
        }
      };
      autoPullRafRef.current = requestAnimationFrame(tick);
    },
    [runRefresh],
  );

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
    setEditSeeds((t.seedSources ?? []).join("\n"));
    setEditMaxAge(t.maxPublishedAgeDays != null ? String(t.maxPublishedAgeDays) : "");
    setMsg(null);
  }

  async function saveEditTopic() {
    if (!editTopic) return;
    const keywords = editKw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!keywords.length) {
      setMsg("至少保留一个关键词");
      return;
    }
    const seedSources = editSeeds
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const ageTrim = editMaxAge.trim();
    let maxPublishedAgeDays: number | null = null;
    if (ageTrim === "") {
      maxPublishedAgeDays = null;
    } else {
      const n = parseInt(ageTrim, 10);
      if (!Number.isFinite(n) || n < 1 || n > 3650) {
        setMsg("可见天数须为 1～3650 的整数，或留空表示使用默认（90 天）");
        return;
      }
      maxPublishedAgeDays = n;
    }
    try {
      const r = await fetch(`/api/browse/topics/${editTopic.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords, seedSources, maxPublishedAgeDays }),
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
    if (isBrowseUiDemoHit(hit)) {
      setMsg("此为开发环境示例卡片，不会加入已读。");
      return;
    }
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
    if (isBrowseUiDemoHit(hit)) {
      setMsg("此为开发环境示例卡片，不会加入待读。");
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
    if (isBrowseUiDemoHit(hit)) {
      setMsg("此为开发环境示例卡片，不会加入已读。");
      return;
    }
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

  const sortedHits = useMemo(() => {
    const s = sortBrowseItemsForDisplay(hits, sortBy);
    return filterBrowseHitsByPublishedAge(s, effectiveMaxPublishedAgeDays(active ?? undefined));
  }, [hits, sortBy, active]);

  /** 生产构建不包含开发示例（NODE_ENV 在客户端打包时固化） */
  const hitsForUi = useMemo(() => {
    if (process.env.NODE_ENV === "production") return sortedHits;
    return [createBrowseUiDemoHit(active?.name ?? "示例主题"), ...sortedHits];
  }, [sortedHits, active?.name]);

  const showPullVisual = pullPx > 4 || refreshing;
  const pullProgress = refreshing ? 1 : Math.min(1, pullPx / 48);

  return (
    <>
      <header className="app-header browse-header-row">
        <div className="app-header-titles">
          <h1
            className="browse-title-refresh"
            title="双击重置当前主题：清空该主题的随览缓存（本地与服务端）；下次下拉刷新按首次规则重新拉取（约近 3 个月窗）"
            onDoubleClick={() => {
              void resetActiveTopic();
            }}
          >
            随览
          </h1>
          <span className="sub">
            默认按原文发布时间排序；首次刷新约近 3 个月窗、增量只补新链接；自首次收录起约保留 90 天。双击标题可重置当前主题缓存。
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
            <div className="browse-kw-actions">
              <button
                type="button"
                className="browse-ai-rejected-btn"
                aria-haspopup="dialog"
                onClick={() => setAiRejectedOpen(true)}
              >
                筛除记录
                {aiRejectedList.length > 0 ? (
                  <span className="browse-ai-rejected-badge" aria-hidden>
                    {aiRejectedList.length}
                  </span>
                ) : null}
              </button>
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
            <label className="muted-link" htmlFor="browse-edit-seeds">
              种子站 / RSS（B · 每行一条 URL 或域名；用于 RSS 拉取与检索 site: 限定）
            </label>
            <textarea
              id="browse-edit-seeds"
              className="input browse-edit-seeds"
              rows={5}
              value={editSeeds}
              onChange={(e) => setEditSeeds(e.target.value)}
              placeholder={"https://hamel.dev/blog/\nhttps://www.youtube.com/"}
              autoComplete="off"
            />
            <label className="muted-link" htmlFor="browse-edit-max-age">
              仅展示原文发布时间在此天数内的条目（留空 = 默认 {BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS} 天；无发布时间的条目仍会显示）
            </label>
            <input
              id="browse-edit-max-age"
              className="input"
              inputMode="numeric"
              value={editMaxAge}
              onChange={(e) => setEditMaxAge(e.target.value)}
              placeholder={`默认 ${BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS}`}
            />
            <div className="browse-form-actions">
              <button className="btn" type="button" onClick={() => void saveEditTopic()}>
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
        {!loadingTopics && activeId && hitsForUi.length === 0 && !refreshing && !autoPulling ? (
          <div className="browse-empty-center">
            <button
              type="button"
              className="browse-empty-refresh-btn"
              aria-label="下拉刷新列表"
              onClick={() => {
                if (!activeId) return;
                startEmptyRefreshWithPull(activeId);
              }}
            >
              <span className="browse-empty-refresh-icon" aria-hidden>
                ↻
              </span>
            </button>
          </div>
        ) : null}
        {hitsForUi.map((h) => (
          <BrowseHitCard
            key={isBrowseUiDemoHit(h) ? "__browse_ui_demo__" : h.url}
            hit={h}
            topicName={active?.name ?? "—"}
            busy={busyUrl === h.url}
            demo={isBrowseUiDemoHit(h)}
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
      {mounted && aiRejectedOpen
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setAiRejectedOpen(false);
              }}
            >
              <div
                className="modal-sheet browse-ai-rejected-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="browse-ai-rejected-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-sheet-header">
                  <h2 id="browse-ai-rejected-title">AI 筛除条目</h2>
                  <button
                    type="button"
                    className="modal-sheet-close"
                    onClick={() => setAiRejectedOpen(false)}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
                  当前主题下被判定为不值得阅读。点击标题打开原文（无文章大意）。
                </p>
                {aiRejectedList.length === 0 ? (
                  <p className="browse-ai-rejected-empty">
                    暂无记录。下拉刷新后若有个别链接被筛除，会出现在此列表。
                  </p>
                ) : (
                  <ul className="browse-ai-rejected-list">
                    {aiRejectedList.map((x) => (
                      <li key={x.url}>
                        <a
                          href={x.url}
                          target="_blank"
                          rel="noreferrer"
                          className="browse-ai-rejected-link"
                        >
                          {x.title}
                        </a>
                        <p className="browse-ai-rejected-reason">{x.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="modal-sheet-footer">
                  <button type="button" className="btn secondary" onClick={() => setAiRejectedOpen(false)}>
                    关闭
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
