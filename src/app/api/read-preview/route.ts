import { NextResponse } from "next/server";
import { generateReadModalSummary } from "@/lib/ai-read-modal-summary";
import { readModalInputHash } from "@/lib/ai-cache-hash";
import { fallbackReadModalBody } from "@/lib/read-modal-fallback";
import { getRouteHandlerUser } from "@/lib/auth/api";
import {
  getAiGenerationCache,
  isDatabaseConfigured,
  recordTokenUsage,
  upsertAiGenerationCache,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_SOURCE = 80000;

export async function POST(req: Request) {
  let payload: { title?: string; url?: string; sourceText?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

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

  if (!sourceText) {
    const fb = fallbackReadModalBody("");
    return NextResponse.json({
      text: fb,
      fallback: true,
      ai: false,
      source: "fallback" as const,
    });
  }

  const session = await getRouteHandlerUser();
  const readModalHash = readModalInputHash(title, url, sourceText);
  if (isDatabaseConfigured()) {
    const row = await getAiGenerationCache(session?.id ?? null, "read_modal_v1", readModalHash);
    const hit = typeof row?.text === "string" ? row.text.trim() : "";
    if (hit) {
      return NextResponse.json({
        text: hit,
        fallback: false,
        ai: true,
        source: "server_cache" as const,
      });
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
    });
  }

  const fb = fallbackReadModalBody(sourceText);
  return NextResponse.json({
    text: fb,
    fallback: true,
    ai: false,
    source: "fallback" as const,
  });
}
