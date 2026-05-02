"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ArticleReadPreviewModal({
  open,
  onClose,
  title,
  url,
  loading,
  bodyText,
  showFallbackNote,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
  loading: boolean;
  bodyText: string;
  showFallbackNote: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop article-read-preview-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-sheet article-read-preview-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-read-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-sheet-header article-read-preview-header-row">
          <h2 id="article-read-preview-title" className="article-read-preview-title">
            {title}
          </h2>
          <button type="button" className="modal-sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="article-read-preview-meta muted-link">
          <a href={url} target="_blank" rel="noreferrer" className="article-read-preview-origin-link">
            查看原文
          </a>
          <span className="article-read-preview-meta-sep" aria-hidden>
            ·
          </span>
          <span>本文由AI总结</span>
        </div>

        <div className="article-read-preview-body">
          {loading ? (
            <p className="article-read-preview-loading muted-link">正在生成摘要…</p>
          ) : (
            <>
              {showFallbackNote ? (
                <p className="article-read-preview-fallback-note muted-link">当前展示为节选摘要（AI 暂不可用或未配置）。</p>
              ) : null}
              <div className="article-read-preview-prose">{bodyText}</div>
            </>
          )}
        </div>

        <div className="article-read-preview-footer muted-link">
          <a href={url} target="_blank" rel="noreferrer">
            查看原文
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
