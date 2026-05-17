"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArticleReadPreviewModal } from "@/components/ArticleReadPreviewModal";
import { readPreviewSourceFromApiPayload, type ReadPreviewSource } from "@/lib/read-preview-source";
import { getReadPreviewUiCache, setReadPreviewUiCache } from "@/lib/read-preview-ui-cache";
import { fallbackReadModalBody } from "@/lib/read-modal-fallback";
import { buildReadPreviewInputLabel } from "@/lib/ai-read-sources-label";

/** 「我的推荐」列表：标题点击打开与书库一致的阅读大意弹窗 */
export function RecommendSentReadPreviewTitle({
  namespaceKey,
  title,
  url,
  sourceText,
  children,
}: {
  namespaceKey: string;
  title: string;
  url: string;
  sourceText: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadPhase, setLoadPhase] = useState<"query" | "generating">("query");
  const [body, setBody] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [previewSource, setPreviewSource] = useState<ReadPreviewSource | null>(null);

  useEffect(() => setMounted(true), []);

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
    if (!open) {
      setPreviewSource(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cached = getReadPreviewUiCache(namespaceKey, title, url, sourceText);
    if (cached) {
      setBody(cached.text);
      setShowFallback(cached.showFallback);
      setLoading(false);
      setPreviewSource("client_cache");
      return () => {
        cancelled = true;
      };
    }

    setPreviewSource(null);
    setLoading(true);
    setBody("");
    setShowFallback(false);
    void fetch("/api/read-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, url, sourceText }),
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          text?: string;
          fallback?: boolean;
          source?: unknown;
          cached?: boolean;
          ai?: boolean;
        };
        if (cancelled) return;
        if (!r.ok) {
          const fb = fallbackReadModalBody(sourceText);
          setBody(fb);
          setShowFallback(true);
          setPreviewSource("fallback");
          setReadPreviewUiCache(namespaceKey, title, url, sourceText, fb, true, "fallback");
          return;
        }
        const text = typeof d.text === "string" ? d.text : "";
        const fall = Boolean(d.fallback);
        const apiSource = readPreviewSourceFromApiPayload(d);
        setBody(text);
        setShowFallback(fall);
        setPreviewSource(apiSource);
        setReadPreviewUiCache(namespaceKey, title, url, sourceText, text, fall, apiSource);
      })
      .catch(() => {
        if (cancelled) return;
        const fb = fallbackReadModalBody(sourceText);
        setBody(fb);
        setShowFallback(true);
        setPreviewSource("fallback");
        setReadPreviewUiCache(namespaceKey, title, url, sourceText, fb, true, "fallback");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, namespaceKey, title, url, sourceText]);

  const readSourcesShort = buildReadPreviewInputLabel(sourceText, url);

  return (
    <>
      <button type="button" className="social-rec-title-btn" onClick={() => setOpen(true)}>
        {children}
      </button>
      {mounted ? (
        <ArticleReadPreviewModal
          open={open}
          onClose={() => setOpen(false)}
          title={title}
          url={url}
          loading={loading}
          loadPhase={loadPhase}
          previewSource={previewSource}
          readSourcesShort={readSourcesShort}
          bodyText={body}
          showFallbackNote={showFallback}
        />
      ) : null}
    </>
  );
}
