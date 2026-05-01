"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowseHit, BrowseTopic } from "@/lib/types";
import {
  loadBrowseStorage,
  mergeBrowseFeed,
  saveBrowseStorage,
  type BrowseStoredHit,
} from "@/lib/browse-storage";
import { BrowseHitCard } from "@/components/BrowseHitCard";

/** 随览列表顶部的文章卡片界面示例（非真实链接、不写库） */
const BROWSE_ARTICLE_CARD_DEMO: BrowseStoredHit = {
  url: "",
  title: "示例：搭建可复现的 LLM 评测小流水线",
  description: "",
  summary:
    "这是随览文章卡片的样式示例。左滑可露出「已读」「待读」；点按钮仅提示说明，不会写入待读或已读。",
  excerpt: "",
  publishedTime: null,
  firstSeenAt: new Date(0).toISOString(),
};

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
    if (!activeId) {
      setHits([]);
      return;
    }
    const store = loadBrowseStorage();
    const feed = store.topics[activeId] ?? { lastRefreshAt: null, items: [] };
    setHits(feed.items);
  }, [activeId]);

  const runRefresh = useCallback(async (topicId: string) => {
    if (!topicId || refreshingRef.current) return;
    setRefreshing(true);
    setMsg(null);
    try {
      const store = loadBrowseStorage();
      const feed = store.topics[topicId] ?? { lastRefreshAt: null, items: [] };
      const sinceIso =
        feed.lastRefreshAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sinceMs = Date.parse(sinceIso);

      const r = await fetch("/api/browse/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId, since: sinceIso }),
      });
      const d = (await r.json()) as { hits?: BrowseHit[]; fetchedAt?: string; error?: string };
      if (!r.ok) throw new Error(d.error || "检索失败");

      const fetchedAt = d.fetchedAt ?? new Date().toISOString();
      const merged = mergeBrowseFeed(feed, d.hits ?? [], fetchedAt, sinceMs);
      store.topics[topicId] = merged;
      saveBrowseStorage(store);

      if (activeIdRef.current === topicId) {
        setHits(merged.items);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "检索失败");
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  async function addHitToPlan(hit: BrowseStoredHit, quickDone: boolean) {
    if (busyUrl) return;
    setBusyUrl(hit.url);
    setMsg(null);
    try {
      const r = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: hit.url,
          quickDone,
          browseTopicName: active?.name ?? "",
        }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(d.message || d.error || "添加失败");
      setMsg(quickDone ? "已加入已读（已填快捷笔记，可稍后在已读里改）" : "已加入待读");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusyUrl(null);
    }
  }

  const active = topics.find((t) => t.id === activeId);

  const showPullVisual = pullPx > 4 || refreshing;
  const pullProgress = refreshing ? 1 : Math.min(1, pullPx / 48);

  return (
    <>
      <header className="app-header app-header-with-actions browse-header-row">
        <div className="app-header-titles">
          <h1>随览</h1>
          <span className="sub">主题与关键词为且、同主题多词为或 · 轻点主题切换 · 联网更新</span>
        </div>
        <button
          type="button"
          className="browse-add-topic-btn"
          aria-label="添加主题"
          onClick={() => setFormOpen(true)}
        >
          +
        </button>
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
          topics.map((t) => (
            <TopicTabButton
              key={t.id}
              t={t}
              active={t.id === activeId}
              onSelect={setActiveId}
              onLongPress={openEditTopic}
            />
          ))
        )}
      </div>

      {active && (
        <p className="muted-link browse-kw-line">
          关键词：<span className="browse-kw-chips">{active.keywords.join(" · ")}</span>
        </p>
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
        {!loadingTopics && hits.length === 0 && (
          <div className="browse-hit-demo-block">
            <p className="browse-hit-demo-caption muted-link">文章卡片示例</p>
            <BrowseHitCard
              demo
              hit={BROWSE_ARTICLE_CARD_DEMO}
              topicName="示例"
              busy={false}
              onAddTodo={async () => {
                setMsg("此为界面示例，未加入待读。");
              }}
              onAddDone={async () => {
                setMsg("此为界面示例，未加入已读。");
              }}
            />
          </div>
        )}
        {!loadingTopics && hits.length === 0 && !msg && (
          <p className="muted-link">
            暂无内容。请先滚回页面顶部，再下拉（触屏）或按住拖拽（鼠标）获取更新。
          </p>
        )}
        {hits.map((h) => (
          <BrowseHitCard
            key={h.url}
            hit={h}
            topicName={active?.name ?? "—"}
            busy={busyUrl === h.url}
            onAddTodo={() => addHitToPlan(h, false)}
            onAddDone={() => addHitToPlan(h, true)}
          />
        ))}
      </div>
    </>
  );
}
