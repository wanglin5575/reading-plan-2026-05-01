"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BrowseAiRejectedItem, BrowseHit, BrowseTopic } from "@/lib/types";
import {
  loadBrowseStorage,
  loadRejectedSeenMap,
  mergeBrowseFeed,
  mergeBrowseTopicFeeds,
  BROWSE_REJECTED_LEGACY_AT,
  mergeBrowseAiRejectedForTopic,
  saveBrowseStorage,
  saveRejectedSeenMap,
  pruneBrowseItems,
  sortBrowseItemsForDisplay,
  BROWSE_BOOTSTRAP_SINCE_MS,
  BROWSE_EXCLUDE_URLS_MAX,
  BROWSE_SORT_LS_KEY,
  type BrowseSortMode,
  type BrowseStoredHit,
  type BrowseTopicFeed,
} from "@/lib/browse-storage";
import { publicationSourceLabelFromUrl } from "@/lib/browse-rejected-meta";
import { filterBrowseHitsByPublishedAge, effectiveMaxPublishedAgeDays } from "@/lib/browse-recency";
import { BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS } from "@/lib/browse-defaults";
import { BrowseHitCard } from "@/components/BrowseHitCard";
import { BrowseFollowFeed } from "@/components/BrowseFollowFeed";
import { createBrowseUiDemoHit, isBrowseUiDemoHit } from "@/lib/browse-demo-preview";
import { normalizeArticleUrlKey } from "@/lib/url-key";

const KW_PREVIEW_MAX = 4;

/** 筛除记录分割线左侧日期文案（本地日历日） */
function formatRejectedDayLabel(iso?: string): string {
  if (!iso || iso === BROWSE_REJECTED_LEGACY_AT) return "早期";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "早期";
  if (d.getFullYear() < 1980) return "早期";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  const [addModalTab, setAddModalTab] = useState<"topic" | "follow">("topic");
  const [followRows, setFollowRows] = useState<{ id: string; followedId: string; label: string }[]>([]);
  const [followSearch, setFollowSearch] = useState("");
  const [followResults, setFollowResults] = useState<{ userId: string; display: string; nickname: string | null }[]>(
    [],
  );
  const [followPickId, setFollowPickId] = useState<string | null>(null);
  const [followLabel, setFollowLabel] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followMsg, setFollowMsg] = useState<string | null>(null);
  const [libraryUrlKeys, setLibraryUrlKeys] = useState<Set<string>>(() => new Set());
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
  const [rejectedSeenNonce, setRejectedSeenNonce] = useState(0);
  const [kwExpanded, setKwExpanded] = useState(false);
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
    const store = loadBrowseStorage();
    setAiRejectedList(store.topics[activeId]?.aiRejected ?? []);
  }, [activeId]);

  useEffect(() => {
    setKwExpanded(false);
  }, [activeId]);

  const rejectedHasUnread = useMemo(() => {
    if (!activeId || aiRejectedList.length === 0) return false;
    const sig = JSON.stringify(aiRejectedList);
    return loadRejectedSeenMap()[activeId] !== sig;
  }, [activeId, aiRejectedList, rejectedSeenNonce]);

  const openAiRejectedModal = useCallback(() => {
    if (activeId && typeof window !== "undefined") {
      const m = { ...loadRejectedSeenMap() };
      m[activeId] = JSON.stringify(aiRejectedList);
      saveRejectedSeenMap(m);
      setRejectedSeenNonce((n) => n + 1);
    }
    setAiRejectedOpen(true);
  }, [activeId, aiRejectedList]);

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

  const reloadFollows = useCallback(async () => {
    try {
      const r = await fetch("/api/social/follows", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { follows?: { id: string; followedId: string; label: string }[] };
      setFollowRows(d.follows ?? []);
    } catch {
      /* 未登录等 */
    }
  }, []);

  useEffect(() => {
    void reloadFollows();
  }, [reloadFollows]);

  const reloadLibraryUrls = useCallback(async () => {
    try {
      const r = await fetch("/api/articles", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { articles?: { url: string }[] };
      const next = new Set<string>();
      for (const a of d.articles ?? []) {
        const k = normalizeArticleUrlKey(a.url);
        if (k) next.add(k);
      }
      setLibraryUrlKeys(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void reloadLibraryUrls();
  }, [reloadLibraryUrls]);

  useEffect(() => {
    const q = followSearch.trim();
    if (q.length < 2) {
      setFollowResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(`/api/social/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
          if (!r.ok) return;
          const d = (await r.json()) as { users?: { userId: string; display: string; nickname: string | null }[] };
          setFollowResults(d.users ?? []);
        } catch {
          setFollowResults([]);
        }
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [followSearch]);

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
    let localFeed = store.topics[topicId] ?? { lastRefreshAt: null, items: [], aiRejected: [] };
    const pruned = pruneBrowseItems(localFeed.items);
    if (pruned.length !== localFeed.items.length) {
      localFeed = { ...localFeed, items: pruned };
      store.topics[topicId] = localFeed;
      saveBrowseStorage(store);
    }
    if (activeIdRef.current === topicId) {
      setHits(localFeed.items);
      setAiRejectedList(localFeed.aiRejected ?? []);
    }

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
      if (activeIdRef.current === topicId) {
        setHits(mergedH.items);
        setAiRejectedList(mergedH.aiRejected ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!activeId) {
      setHits([]);
      setAiRejectedList([]);
      return;
    }
    if (activeId.startsWith("__follow__")) {
      setHits([]);
      setAiRejectedList([]);
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

  const executeTopicNetworkRefresh = useCallback(async (topicId: string): Promise<{
    merged: BrowseTopicFeed;
    hitCount: number;
    skippedKnown: number;
  } | null> => {
    if (topicId.startsWith("__follow__")) return null;
    const store = loadBrowseStorage();
    const feed = store.topics[topicId] ?? { lastRefreshAt: null, items: [], aiRejected: [] };
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
    const mergedBase = mergeBrowseFeed(feed, d.hits ?? [], fetchedAt, sinceMs);
    const rej = Array.isArray(d.aiRejected) ? d.aiRejected : [];
    const mergedRej = mergeBrowseAiRejectedForTopic(feed.aiRejected ?? [], rej, fetchedAt);
    const merged: BrowseTopicFeed = { ...mergedBase, aiRejected: mergedRej };
    store.topics[topicId] = merged;
    saveBrowseStorage(store);
    await pushTopicFeedToServer(topicId, merged);

    if (typeof window !== "undefined" && activeIdRef.current === topicId) {
      setAiRejectedList(mergedRej);
    }

    return {
      merged,
      hitCount: d.hits?.length ?? 0,
      skippedKnown: d.skippedKnown ?? 0,
    };
  }, [pushTopicFeedToServer]);

  const runRefresh = useCallback(
    async (topicId: string) => {
      if (!topicId || topicId.startsWith("__follow__") || refreshingRef.current) return;
      setRefreshing(true);
      setMsg(null);
      try {
        const pack = await executeTopicNetworkRefresh(topicId);
        if (!pack) return;
        const { merged, hitCount, skippedKnown } = pack;
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

      const seen = loadRejectedSeenMap();
      delete seen[cur];
      saveRejectedSeenMap(seen);
      setRejectedSeenNonce((n) => n + 1);
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
      if (!topicId || topicId.startsWith("__follow__") || refreshingRef.current || autoPullBusyRef.current) return;
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
      setAddModalTab("topic");
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
      setAiRejectedList(nextId ? (storeAfter.topics[nextId]?.aiRejected ?? []) : []);
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

  const isFollowTab = Boolean(activeId?.startsWith("__follow__"));
  const followTargetUserId = isFollowTab && activeId ? activeId.slice("__follow__".length) : null;
  const activeTopicEntity = !isFollowTab ? topics.find((t) => t.id === activeId) : undefined;

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
          browseTopicName: activeTopicEntity?.name ?? "",
        }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "添加失败");
      setMsg("已加入待读");
      await reloadLibraryUrls();
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
          browseTopicName: activeTopicEntity?.name ?? "",
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
      await reloadLibraryUrls();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusyUrl(null);
    }
  }

  async function onAddFollowSubmit(e: React.FormEvent) {
    e.preventDefault();
    const uid = followPickId;
    if (!uid) {
      setFollowMsg("请先搜索并选择一位已注册用户");
      return;
    }
    setFollowBusy(true);
    setFollowMsg(null);
    try {
      const r = await fetch("/api/social/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ followedUserId: uid, label: followLabel.trim() || "关注" }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "关注失败");
      setFormOpen(false);
      setFollowPickId(null);
      setFollowLabel("");
      setFollowSearch("");
      setFollowResults([]);
      setAddModalTab("topic");
      await reloadFollows();
      setActiveId(`__follow__${uid}`);
    } catch (err) {
      setFollowMsg(err instanceof Error ? err.message : "失败");
    } finally {
      setFollowBusy(false);
    }
  }

  const kwDisplayText = useMemo(() => {
    const kws = activeTopicEntity?.keywords ?? [];
    if (kws.length === 0) return "";
    if (kwExpanded || kws.length <= KW_PREVIEW_MAX) return kws.join(" · ");
    return `${kws.slice(0, KW_PREVIEW_MAX).join(" · ")} ···`;
  }, [activeTopicEntity?.keywords, kwExpanded]);

  const kwNeedsExpand = (activeTopicEntity?.keywords.length ?? 0) > KW_PREVIEW_MAX;

  const rejectedGrouped = useMemo(() => {
    const sorted = [...aiRejectedList].sort(
      (a, b) => Date.parse(b.updatedAt ?? "0") - Date.parse(a.updatedAt ?? "0"),
    );
    const groups: { dayLabel: string; items: BrowseAiRejectedItem[] }[] = [];
    for (const x of sorted) {
      const label = formatRejectedDayLabel(x.updatedAt);
      const last = groups[groups.length - 1];
      if (last && last.dayLabel === label) last.items.push(x);
      else groups.push({ dayLabel: label, items: [x] });
    }
    return groups;
  }, [aiRejectedList]);

  const sortedHits = useMemo(() => {
    const s = sortBrowseItemsForDisplay(hits, sortBy);
    return filterBrowseHitsByPublishedAge(s, effectiveMaxPublishedAgeDays(activeTopicEntity ?? undefined));
  }, [hits, sortBy, activeTopicEntity]);

  const sortedHitsLibFiltered = useMemo(() => {
    if (libraryUrlKeys.size === 0) return sortedHits;
    return sortedHits.filter((h) => !libraryUrlKeys.has(normalizeArticleUrlKey(h.url)));
  }, [sortedHits, libraryUrlKeys]);

  /** 生产构建不包含开发示例（NODE_ENV 在客户端打包时固化）；无主题时不插入示例卡片 */
  const hitsForUi = useMemo(() => {
    if (!activeId || topics.length === 0) return sortedHitsLibFiltered;
    if (isFollowTab || process.env.NODE_ENV === "production") return sortedHitsLibFiltered;
    return [createBrowseUiDemoHit(activeTopicEntity?.name ?? "示例主题"), ...sortedHitsLibFiltered];
  }, [sortedHitsLibFiltered, activeTopicEntity?.name, activeId, topics.length, isFollowTab]);

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
            {followRows.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`browse-topic-tab ${activeId === `__follow__${f.followedId}` ? "active" : ""}`}
                onClick={() => setActiveId(`__follow__${f.followedId}`)}
              >
                {f.label?.trim() || "关注"}
              </button>
            ))}
            <button
              type="button"
              className="browse-topic-tab browse-topic-tab-add"
              aria-label="添加主题或关注"
              onClick={() => {
                setAddModalTab("topic");
                setFollowMsg(null);
                setFormOpen(true);
              }}
            >
              +
            </button>
          </>
        )}
      </div>

      {!loadingTopics && topics.length === 0 ? (
        <div className="card browse-onboarding-card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>还没有随览主题</h2>
          <p className="muted-link" style={{ lineHeight: 1.6 }}>
            随览按「主题 + 关键词」从网络发现文章：先起一个主题名，再填若干关键词（逗号分隔）。保存后点「+」旁的编辑可补充<strong>种子站 / RSS</strong>
            （每行一条 URL），下拉刷新即可拉取。
          </p>
          <p className="muted-link" style={{ fontWeight: 600, marginBottom: 6 }}>
            举例（可按需改写）
          </p>
          <ul className="muted-link" style={{ margin: "0 0 12px", paddingLeft: 20, lineHeight: 1.65 }}>
            <li>
              主题名「大模型评测」· 关键词 <code className="admin-code-inline">benchmark, evaluation, LLM</code>
            </li>
            <li>
              主题名「产品周报」· 关键词 <code className="admin-code-inline">release notes, changelog, 产品更新</code>
            </li>
            <li>
              主题名「前端架构」· 关键词 <code className="admin-code-inline">React, performance, bundler</code>
            </li>
          </ul>
          <button type="button" className="btn" onClick={() => setFormOpen(true)}>
            添加第一个主题
          </button>
        </div>
      ) : null}

      {activeTopicEntity && !isFollowTab && (
        <div className="browse-kw-row">
          <div
            className="muted-link browse-kw-line browse-kw-main"
          >
            <span className="browse-kw-fixed-label">关键词：</span>
            <button
              type="button"
              className={`browse-kw-chips-btn${kwNeedsExpand || kwExpanded ? " browse-kw-chips-btn--interactive" : ""}`}
              aria-expanded={kwNeedsExpand || kwExpanded ? kwExpanded : undefined}
              aria-label={
                kwNeedsExpand || kwExpanded
                  ? kwExpanded
                    ? "收起关键词全文"
                    : "展开关键词全文"
                  : undefined
              }
              tabIndex={kwNeedsExpand || kwExpanded ? 0 : -1}
              onClick={() => {
                if (!kwNeedsExpand && !kwExpanded) return;
                setKwExpanded((v) => !v);
              }}
            >
              <span className="browse-kw-chips">{kwDisplayText}</span>
            </button>
          </div>
          {!loadingTopics ? (
            <div className="browse-kw-actions">
              <button
                type="button"
                className="browse-ai-rejected-btn"
                aria-haspopup="dialog"
                aria-label={
                  rejectedHasUnread ? "筛除记录（有新筛除条目）" : "筛除记录"
                }
                onClick={() => openAiRejectedModal()}
              >
                <span className="browse-ai-rejected-btn-text">
                  筛除记
                  <span className="browse-ai-rejected-record-wrap">
                    录
                    {rejectedHasUnread ? (
                      <span className="browse-ai-rejected-unread-dot" aria-hidden />
                    ) : null}
                  </span>
                </span>
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
        <div
          className="browse-modal-backdrop"
          role="presentation"
          onClick={() => {
            setFormOpen(false);
            setFollowMsg(null);
          }}
        >
          <div
            className="card browse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="browse-add-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="browse-add-modal-tabs browse-add-modal-tabs--chips" role="tablist" aria-label="添加方式">
              <button
                type="button"
                role="tab"
                aria-selected={addModalTab === "topic"}
                className={`browse-add-chip${addModalTab === "topic" ? " is-active" : ""}`}
                onClick={() => setAddModalTab("topic")}
              >
                添加主题
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addModalTab === "follow"}
                className={`browse-add-chip${addModalTab === "follow" ? " is-active" : ""}`}
                onClick={() => setAddModalTab("follow")}
              >
                关注用户
              </button>
            </div>
            {addModalTab === "topic" ? (
              <>
                <h2 id="browse-add-modal-title">添加主题</h2>
                <form className="row" onSubmit={onAddTopic}>
                  <label className="muted-link" htmlFor="browse-new-name">
                    主题名称
                  </label>
                  <input
                    id="browse-new-name"
                    className="input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="如：大模型评测"
                  />
                  <label className="muted-link" htmlFor="browse-new-kw">
                    关键词（与主题为且，多项为或；逗号分隔）
                  </label>
                  <input
                    id="browse-new-kw"
                    className="input"
                    value={newKw}
                    onChange={(e) => setNewKw(e.target.value)}
                    placeholder="benchmark, evaluation, 论文（中英文逗号均可）"
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
              </>
            ) : (
              <>
                <h2 id="browse-add-modal-title">关注用户</h2>
                <p className="muted-link" style={{ fontSize: "var(--fs-small)" }}>
                  搜索已注册用户的邮箱或昵称；未在系统中注册的用户无法关注。
                </p>
                <form className="row" onSubmit={onAddFollowSubmit}>
                  <label className="muted-link" htmlFor="browse-follow-search">
                    搜索
                  </label>
                  <input
                    id="browse-follow-search"
                    className="input"
                    value={followSearch}
                    onChange={(e) => setFollowSearch(e.target.value)}
                    placeholder="邮箱或昵称，至少 2 个字符"
                    autoComplete="off"
                  />
                  {followResults.length > 0 ? (
                    <ul className="browse-follow-search-results">
                      {followResults.map((u) => {
                        const selected = followPickId === u.userId;
                        return (
                          <li key={u.userId}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={selected}
                              className={`browse-follow-pick-row${selected ? " is-selected" : ""}`}
                              onClick={() => setFollowPickId((prev) => (prev === u.userId ? null : u.userId))}
                            >
                              <span className="browse-follow-cb" aria-hidden />
                              <span className="browse-follow-pick-main">
                                <span className="browse-follow-pick-line">
                                  <span className="browse-follow-pick-display">{u.display}</span>
                                  {u.nickname ? (
                                    <span className="browse-follow-pick-nick muted-link"> · {u.nickname}</span>
                                  ) : null}
                                </span>
                                <span className="browse-follow-pick-uid muted-link">{u.userId}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : followSearch.trim().length >= 2 ? (
                    <p className="muted-link">无此用户（尚未注册或关键词不匹配）</p>
                  ) : null}
                  <label className="muted-link" htmlFor="browse-follow-label">
                    备注名称（显示在随览标签上）
                  </label>
                  <input
                    id="browse-follow-label"
                    className="input"
                    value={followLabel}
                    onChange={(e) => setFollowLabel(e.target.value)}
                    placeholder="如：大牛的待读"
                  />
                  {followMsg ? <p className="me-msg">{followMsg}</p> : null}
                  <div className="browse-form-actions">
                    <button className="btn" type="submit" disabled={followBusy}>
                      {followBusy ? "提交中…" : "关注"}
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setFormOpen(false)}>
                      取消
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <div className="browse-hits">
        {isFollowTab && followTargetUserId ? (
          <BrowseFollowFeed followedUserId={followTargetUserId} />
        ) : (
          <>
            {!loadingTopics && activeId && !isFollowTab && hitsForUi.length === 0 && !refreshing && !autoPulling ? (
              <div className="browse-empty-center">
                <button
                  type="button"
                  className="browse-empty-refresh-btn"
                  aria-label="下拉刷新列表"
                  onClick={() => {
                    if (!activeId || activeId.startsWith("__follow__")) return;
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
                topicId={activeId ?? ""}
                topicName={activeTopicEntity?.name ?? "—"}
                busy={busyUrl === h.url}
                demo={isBrowseUiDemoHit(h)}
                onAddTodo={() => addHitToPlanTodo(h)}
                onAddDone={async () => {
                  openBrowseMarkDone(h);
                }}
              />
            ))}
          </>
        )}
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
                    {rejectedGrouped.map((g, gi) => (
                      <Fragment key={`${g.dayLabel}-${gi}`}>
                        <li className="browse-ai-rejected-day-split">
                          <span className="browse-ai-rejected-day-label">{g.dayLabel}</span>
                        </li>
                        {g.items.map((x) => {
                          const src =
                            (x.sourceLabel && String(x.sourceLabel).trim()) ||
                            publicationSourceLabelFromUrl(x.url);
                          const authorLine =
                            x.author && String(x.author).trim() ? String(x.author).trim() : null;
                          return (
                            <li key={x.url}>
                              <a
                                href={x.url}
                                target="_blank"
                                rel="noreferrer"
                                className="browse-ai-rejected-link"
                              >
                                {x.title}
                              </a>
                              <p className="browse-ai-rejected-meta">
                                <span>{src}</span>
                                {authorLine ? <span> · 作者：{authorLine}</span> : null}
                              </p>
                              <p className="browse-ai-rejected-reason">{x.reason}</p>
                            </li>
                          );
                        })}
                      </Fragment>
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
