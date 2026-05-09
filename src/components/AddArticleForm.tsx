"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Article } from "@/lib/types";
import { ArticleCard } from "@/components/ArticleCard";

const STEPS = [
  { key: "scrape", label: "拉取网页与正文" },
  { key: "ai", label: "AI 生成摘要与主题" },
  { key: "save", label: "写入你的书库" },
] as const;

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export function AddArticleForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [dueDate, setDueDate] = useState(() => defaultDueDate());
  const [featured, setFeatured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<Article | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [scrapePayload, setScrapePayload] = useState<unknown | null>(null);
  const [recommendToUserId, setRecommendToUserId] = useState("");
  const [followOptions, setFollowOptions] = useState<{ followedId: string; label: string; nickname: string }[]>([]);
  const [recommendConfirmOpen, setRecommendConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const r = await fetch("/api/social/follows?mutual=1", { cache: "no-store" });
        const d = (await r.json()) as { follows?: { followedId: string; label: string; nickname: string }[] };
        if (!r.ok || c) return;
        setFollowOptions(
          (d.follows ?? []).map((x) => ({
            followedId: x.followedId,
            label: x.label?.trim() || "",
            nickname: x.nickname?.trim() || "用户",
          })),
        );
      } catch {
        if (!c) setFollowOptions([]);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  async function runSubmitPipeline(opts: { skipScrape: boolean }) {
    setError(null);
    setSuccess(null);
    if (!url.trim()) return;
    setLoading(true);
    setLastAdded(null);
    let scrape = scrapePayload;
    try {
      if (!opts.skipScrape) {
        setActiveStep(0);
        const sr = await fetch("/api/articles/scrape", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        const sd = (await sr.json()) as { scrape?: unknown; error?: string; message?: string };
        if (!sr.ok) throw new Error(sd.message || sd.error || "抓取失败");
        scrape = sd.scrape ?? null;
        setScrapePayload(scrape);
      }
      setActiveStep(1);
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          dueDate,
          featured,
          scrape,
          recommendToUserId: recommendToUserId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        article?: Article;
        error?: string;
        message?: string;
        recommendNote?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.message || data.error || "添加失败");
      }
      setActiveStep(2);
      setLastAdded(data.article || null);
      let okMsg = "添加成功";
      if (data.recommendNote) okMsg = `添加成功（推荐未完全成功：${data.recommendNote}）`;
      setSuccess(okMsg);
      setUrl("");
      setFeatured(false);
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setSuccess(null);
      setLastAdded(null);
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setLoading(false);
    }
  }

  function recommendTargetLabel(): string {
    const id = recommendToUserId.trim();
    if (!id) return "";
    const f = followOptions.find((x) => x.followedId === id);
    if (!f) return "该用户";
    return f.label ? `${f.label}（${f.nickname}）` : f.nickname;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (recommendToUserId.trim()) {
      setRecommendConfirmOpen(true);
      return;
    }
    setScrapePayload(null);
    await runSubmitPipeline({ skipScrape: false });
  }

  async function confirmRecommendSubmit() {
    setRecommendConfirmOpen(false);
    setScrapePayload(null);
    await runSubmitPipeline({ skipScrape: false });
  }

  return (
    <>
      <form className="card add-article-card" onSubmit={(e) => void onSubmit(e)}>
        <h2>添加阅读计划</h2>
        <div className="row">
          <div className="add-form-url-wrap">
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
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
          {followOptions.length > 0 ? (
            <>
              <label className="muted-link" htmlFor="add-recommend-to">
                同时推荐给（可选，需互相关注）
              </label>
              <select
                id="add-recommend-to"
                className="input add-form-select"
                value={recommendToUserId}
                onChange={(e) => setRecommendToUserId(e.target.value)}
                aria-label="推荐给互关用户"
              >
                <option value="">不推荐给他人</option>
                {followOptions.map((f) => (
                  <option key={f.followedId} value={f.followedId}>
                    {f.label ? `${f.label}（${f.nickname}）` : f.nickname}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <div className="featured-wrap">
            <div className="muted-link featured-choice-label" id="add-featured-label">
              是否标记为重点精读
            </div>
            <label className="featured-check-row" htmlFor="add-featured-check">
              <input
                id="add-featured-check"
                type="checkbox"
                className="featured-check-input"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                aria-labelledby="add-featured-label"
              />
              <span className="featured-check-text">重点精读</span>
            </label>
          </div>

          {loading ? (
            <ol className="add-article-steps" aria-label="添加进度">
              {STEPS.map((s, i) => (
                <li key={s.key} className={`add-article-step${i < activeStep ? " done" : ""}${i === activeStep ? " active" : ""}`}>
                  <span className="add-article-step-idx">{i + 1}</span>
                  <span className="add-article-step-label">{s.label}</span>
                  {i === activeStep ? <span className="add-article-step-pulse" aria-hidden /> : null}
                </li>
              ))}
            </ol>
          ) : null}

          <button className="btn" type="submit" disabled={loading || isPending}>
            {loading ? "处理中…" : "添加阅读计划"}
          </button>
          {success && <div className="text-success-inline">{success}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      </form>

      {lastAdded && (
        <section className="add-article-success" aria-labelledby="add-article-success-title">
          <h2 id="add-article-success-title" className="add-article-success-title">
            添加成功 · 与「待读」相同卡片（可点击标题看摘要、左滑已读）
          </h2>
          <ArticleCard article={lastAdded} />
        </section>
      )}

      {mounted && recommendConfirmOpen
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => e.target === e.currentTarget && !loading && setRecommendConfirmOpen(false)}
            >
              <div
                className="modal-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-rec-confirm-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-sheet-header">
                  <h2 id="add-rec-confirm-title">确认同时推荐</h2>
                  <button
                    type="button"
                    className="modal-sheet-close"
                    onClick={() => !loading && setRecommendConfirmOpen(false)}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-sheet-body">
                  <p className="muted-link" style={{ fontSize: "var(--fs-small)", margin: "0 0 12px" }}>
                    将把当前链接加入你的书库，并同时推荐给「{recommendTargetLabel()}」。对方待读中会出现对应篇目。
                  </p>
                </div>
                <div className="modal-sheet-footer">
                  <button type="button" className="btn secondary" disabled={loading} onClick={() => setRecommendConfirmOpen(false)}>
                    取消
                  </button>
                  <button type="button" className="btn" disabled={loading} onClick={() => void confirmRecommendSubmit()}>
                    {loading ? "处理中…" : "确认添加并推荐"}
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
