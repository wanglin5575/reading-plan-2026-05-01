import { NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/scrape";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { isAuthEnabled } from "@/lib/auth";
import { duplicateArticleMessage, findExistingArticleByUrl } from "@/lib/article-duplicate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (isAuthEnabled()) {
    if (!session?.id) {
      return NextResponse.json({ error: "unauthorized", message: "请先登录。" }, { status: 401 });
    }
  }
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "url_required" }, { status: 400 });
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  const existing = await findExistingArticleByUrl(session?.id ?? null, url);
  if (existing) {
    return NextResponse.json(
      {
        error: "duplicate_article",
        message: duplicateArticleMessage(existing),
        existingArticleId: existing.article.id,
        sequenceNumber: existing.sequenceNumber,
      },
      { status: 409 },
    );
  }
  try {
    const scrape = await scrapeUrl(url);
    return NextResponse.json({ scrape });
  } catch (e) {
    console.error("[articles/scrape]", e);
    return NextResponse.json({ error: "scrape_failed", message: e instanceof Error ? e.message : "抓取失败" }, { status: 502 });
  }
}
