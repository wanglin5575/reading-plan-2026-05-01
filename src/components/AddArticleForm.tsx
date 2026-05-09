"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [aiFailed, setAiFailed] = useState(false);

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const r = await fetch("/api/social/follows", { cache: "no-store" });
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
    setAiFailed(false);
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
      if (res.status === 503 && data.error === "ai_failed") {
        setAiFailed(true);
        setError(data.message || "AI 生成失败，可点击「重新 AI 生成」重试（无需重新抓取网页）");
        setActiveStep(1);
        return;
      }
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setScrapePayload(null);
    await runSubmitPipeline({ skipScrape: false });
  }

  async function onRetryAi() {
    if (!scrapePayload || !url.trim()) {
      setError("请先重新提交链接以完成抓取");
      return;
    }
    await runSubmitPipeline({ skipScrape: true });
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
                同时推荐给（可选，需已关注对方）
              </label>
              <select
                id="add-recommend-to"
                className="input add-form-select"
                value={recommendToUserId}
                onChange={(e) => setRecommendToUserId(e.target.value)}
                aria-label="推荐给关注用户"
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
          {aiFailed && scrapePayload ? (
            <button type="button" className="btn secondary" disabled={loading} onClick={() => void onRetryAi()}>
              重新 AI 生成
            </button>
          ) : null}
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
    </>
  );
}
