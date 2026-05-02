import { NextResponse } from "next/server";
import { generateReadModalSummary } from "@/lib/ai-read-modal-summary";
import { fallbackReadModalBody } from "@/lib/read-modal-fallback";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { recordTokenUsage } from "@/lib/db";

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
    });
  }

  const session = await getRouteHandlerUser();
  const ai = await generateReadModalSummary({ title, url, sourceText });

  if (ai?.text) {
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
    });
  }

  const fb = fallbackReadModalBody(sourceText);
  return NextResponse.json({
    text: fb,
    fallback: true,
    ai: false,
  });
}
