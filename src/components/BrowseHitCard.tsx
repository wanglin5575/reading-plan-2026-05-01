"use client";

import { ArticleTitleLink } from "@/components/ArticleCard";
import { useSwipeCardFace } from "@/lib/useSwipeCardFace";
import type { BrowseStoredHit } from "@/lib/browse-storage";

/** 与待读列表同一套滑轨；右缘两枚圆钮：已读 + 待读（加入已读 / 加入待读） */
const BROWSE_SWIPE_REVEAL_PX = 144;

export function BrowseHitCard({
  hit,
  topicName,
  busy,
  onAddTodo,
  onAddDone,
  demo = false,
}: {
  hit: BrowseStoredHit;
  topicName: string;
  busy: boolean;
  onAddTodo: () => Promise<void>;
  onAddDone: () => Promise<void>;
  /** 界面示例：标题不外链，按钮仍可用于预览交互 */
  demo?: boolean;
}) {
  const swipe = useSwipeCardFace(!busy, BROWSE_SWIPE_REVEAL_PX);

  const summaryText = (hit.summary || hit.excerpt || "").trim();
  const showSummary = Boolean(summaryText && summaryText !== "(暂无摘要)");

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
      >
        <div className="article-card-top">
          <div className="meta-row article-card-meta">
            <span className="tag theme">随览 · {topicName}</span>
            <span className="tag skim">快速扫览</span>
          </div>
        </div>
        {demo ? (
          <h3 className="title browse-hit-demo-title">{hit.title}</h3>
        ) : (
          <ArticleTitleLink url={hit.url}>
            <h3 className="title">{hit.title}</h3>
          </ArticleTitleLink>
        )}
        <div className="muted-link">作者：未知作者</div>
        {showSummary ? <p className="summary">{summaryText}</p> : null}
      </article>
    </div>
  );
}
