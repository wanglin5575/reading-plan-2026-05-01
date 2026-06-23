import { NextResponse } from "next/server";
import { generateReadModalSummary } from "@/lib/ai-read-modal-summary";
import { readModalInputHash } from "@/lib/ai-cache-hash";
import { fallbackReadModalBody } from "@/lib/read-modal-fallback";
import { getRouteHandlerUser } from "@/lib/auth/api";
import {
  getAiGenerationCache,
  getAiGenerationCacheByUrlKey,
  isDatabaseConfigured,
  recordTokenUsage,
  upsertAiGenerationCache,
} from "@/lib/db";
import { normalizeArticleUrlKey } from "@/lib/url-key";
import { buildReadPreviewInputLabel } from "@/lib/ai-read-sources-label";
import { stripMarkdownToPlainText } from "@/lib/strip-markdown";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_SOURCE = 80000;

export async function POST(req: Request) {
  let payload: { title?: string; url?: string; sourceText?: string; forceRefresh?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const forceRefresh = Boolean(payload.forceRefresh);

  const title = payload.title?.trim() || "无标题";
  const url = payload.url?.trim() || "";
  let sourceText = (payload.sourceText ?? "").trim().slice(0, MAX_SOURCE);
  if (!url) {
    return NextResponse.json({ error: "url_required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const readSourcesLabel = buildReadPreviewInputLabel(sourceText, url);

  if (!sourceText) {
    const fb = fallbackReadModalBody("");
    return NextResponse.json({
      text: fb,
      fallback: true,
      ai: false,
      source: "fallback" as const,
      readSourcesLabel,
    });
  }

  const session = await getRouteHandlerUser();
  const readModalHash = readModalInputHash(title, url, sourceText);
  const urlKey = normalizeArticleUrlKey(url);
  if (!forceRefresh && isDatabaseConfigured()) {
    const row = await getAiGenerationCache(session?.id ?? null, "read_modal_v1", readModalHash);
    const hit = typeof row?.text === "string" ? stripMarkdownToPlainText(row.text) : "";
    if (hit) {
      return NextResponse.json({
        text: hit,
        fallback: false,
        ai: true,
        source: "server_cache" as const,
        readSourcesLabel,
      });
    }
    if (urlKey) {
      const byUrl = await getAiGenerationCacheByUrlKey("read_modal_v1", urlKey);
      const hitUrl = typeof byUrl?.text === "string" ? stripMarkdownToPlainText(byUrl.text) : "";
      if (hitUrl) {
        return NextResponse.json({
          text: hitUrl,
          fallback: false,
          ai: true,
          source: "server_cache" as const,
          readSourcesLabel,
        });
      }
    }
  }

  const ai = await generateReadModalSummary({ title, url, sourceText });

  if (ai?.text) {
    if (isDatabaseConfigured()) {
      void upsertAiGenerationCache(
        session?.id ?? null,
        "read_modal_v1",
        readModalHash,
        { text: ai.text },
        ai.usage && ai.usage.totalTokens > 0
          ? {
              promptTokens: ai.usage.promptTokens,
              completionTokens: ai.usage.completionTokens,
              totalTokens: ai.usage.totalTokens,
            }
          : undefined,
        urlKey || null,
      );
    }
    if (ai.usage && ai.usage.totalTokens > 0 && session) {
      void recordTokenUsage({
        userId: session.id,
        source: "read_preview",
        promptTokens: ai.usage.promptTokens,
        completionTokens: ai.usage.completionTokens,
        totalTokens: ai.usage.totalTokens,
      });
    }
    return NextResponse.json({
      text: ai.text,
      fallback: false,
      ai: true,
      source: "llm" as const,
      readSourcesLabel,
    });
  }

  const fb = fallbackReadModalBody(sourceText);
  return NextResponse.json({
    text: fb,
    fallback: true,
    ai: false,
    source: "fallback" as const,
    readSourcesLabel,
  });
}
