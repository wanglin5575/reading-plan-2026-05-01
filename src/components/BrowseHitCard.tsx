"use client";

import { ArticleTitleLink } from "@/components/ArticleCard";
import { useSwipeCardFace } from "@/lib/useSwipeCardFace";
import type { BrowseStoredHit } from "@/lib/browse-storage";
import { formatPublishedTimeZh, resolveBrowseAuthorLine } from "@/lib/browse-attribution";
import { MEDIA_KIND_LABEL } from "@/lib/media-kind";
import { countChars, countWords, detectLanguage, estimateMinutes } from "@/lib/classify-basics";
import { buildBrowseAiReadSourcesLabel, buildReadPreviewInputLabel } from "@/lib/ai-read-sources-label";

/** 与待读列表同一套滑轨；右缘两枚圆钮：已读 + 待读（加入已读 / 加入待读） */
const BROWSE_SWIPE_REVEAL_PX = 144;

function buildBrowseHitPreviewSource(hit: BrowseStoredHit): string {
  const parts = [hit.summary, hit.excerpt, hit.description]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x && x !== "(暂无摘要)");
  return parts.join("\n\n");
}

export function BrowseHitCard({
  hit,
  topicId,
  topicName,
  busy,
  onAddTodo,
  onAddDone,
  demo = false,
}: {
  hit: BrowseStoredHit;
  topicId: string;
  topicName: string;
  busy: boolean;
  onAddTodo: () => Promise<void>;
  onAddDone: () => Promise<void>;
  /** 界面示例：标题不外链，按钮仍可用于预览交互 */
  demo?: boolean;
}) {
  const swipe = useSwipeCardFace(!busy, BROWSE_SWIPE_REVEAL_PX);

  const summaryText = (hit.summary || hit.excerpt || "").trim();
  const excerptRaw = (hit.excerpt || "").trim();
  const showSummary = Boolean(summaryText && summaryText !== "(暂无摘要)");
  const browsePreviewReadShort =
    hit.aiReadSourcesLabel?.trim() || buildReadPreviewInputLabel(buildBrowseHitPreviewSource(hit), hit.url);
  const browseAiReadLead =
    hit.summarySource === "ai"
      ? hit.aiReadSourcesLabel?.trim() || buildBrowseAiReadSourcesLabel(hit)
      : "";

  const estimateBlob = `${summaryText}\n${excerptRaw}`;
  const readMins =
    hit.estimatedMinutes ??
    estimateMinutes(
      countChars(estimateBlob),
      countWords(estimateBlob),
      detectLanguage(`${hit.title}\n${summaryText}`),
    );

  const authorShown = resolveBrowseAuthorLine(
    hit.author,
    hit.title,
    summaryText,
    excerptRaw || summaryText,
    hit.url,
  );
  const pubZh = formatPublishedTimeZh(hit.publishedTime ?? null);
  const mediaLabel = MEDIA_KIND_LABEL[hit.mediaType ?? "article"];

  async function handleTodo() {
    swipe.resetOffset();
    await onAddTodo();
  }

  async function handleDone() {
    swipe.resetOffset();
    await onAddDone();
  }

  return (
    <div className="article-swipe-host">
      <div className="article-swipe-underlay article-swipe-underlay--double">
        <button
          type="button"
          className="article-swipe-read-circle"
          disabled={busy}
          aria-label="加入已读"
          onClick={() => {
            void handleDone();
          }}
        >
          已读
        </button>
        <button
          type="button"
          className="article-swipe-todo-circle"
          disabled={busy}
          aria-label="加入待读"
          onClick={() => {
            void handleTodo();
          }}
        >
          待读
        </button>
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
        <div className="article-card-top browse-hit-card-top">
          <div className="meta-row article-card-meta">
            <span className="tag theme">随览 · {topicName}</span>
            <span className="tag media-kind">{mediaLabel}</span>
            <span className="tag skim">快速扫览</span>
          </div>
          <span className="browse-hit-read-mins" aria-label={`预估阅读约 ${readMins} 分钟`}>
            约 {readMins} 分钟
          </span>
        </div>
        {demo ? (
          <h3 className="title browse-hit-demo-title">{hit.title}</h3>
        ) : (
          <>
            <ArticleTitleLink
              previewCacheNamespaceId={hit.url}
              url={hit.url}
              previewTitle={hit.title}
              previewSourceText={buildBrowseHitPreviewSource(hit)}
              readSourcesShort={browsePreviewReadShort}
            >
              <h3 className="title">{hit.title}</h3>
            </ArticleTitleLink>
            {hit.titleZh?.trim() ? (
              <p className="article-card-title-zh-muted browse-hit-title-zh">{hit.titleZh.trim()}</p>
            ) : null}
          </>
        )}
        <div className="browse-hit-byline">
          <span className="browse-hit-byline-author">作者：{authorShown}</span>
          <span className="browse-hit-byline-pub">{pubZh ? `原文：${pubZh}` : "原文时间未提供"}</span>
        </div>
        {showSummary && !demo ? (
          <ArticleTitleLink
            previewCacheNamespaceId={hit.url}
            url={hit.url}
            previewTitle={hit.title}
            previewSourceText={buildBrowseHitPreviewSource(hit)}
            readSourcesShort={browsePreviewReadShort}
            className="browse-hit-summary-as-title"
          >
            <p className="summary">
              {hit.summarySource === "ai" ? (
                <>
                  <span className="browse-hit-ai-inline" title={`模型读取：${browseAiReadLead}`}>
                    AI生成(读取{browseAiReadLead})：
                  </span>
                  {summaryText}
                </>
              ) : (
                summaryText
              )}
            </p>
          </ArticleTitleLink>
        ) : showSummary && demo ? (
          <p className="summary">
            {hit.summarySource === "ai" ? (
              <>
                <span className="browse-hit-ai-inline" title={`模型读取：${browseAiReadLead}`}>
                  AI生成(读取{browseAiReadLead})：
                </span>
                {summaryText}
              </>
            ) : (
              summaryText
            )}
          </p>
        ) : null}
        {hit.url ? (
          <div className="browse-hit-source-url" title={hit.url}>
            {hit.url}
          </div>
        ) : null}
      </article>
    </div>
  );
}
