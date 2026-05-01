import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { insertArticle, listArticles } from "@/lib/db";
import { buildArticleClassification } from "@/lib/classify";
import { scrapeUrl } from "@/lib/scrape";
import { todayIso, shiftDays } from "@/lib/plan";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ articles: listArticles() });
}

export async function POST(req: Request) {
  let payload: { url?: string; dueDate?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const url = payload.url?.trim();
  if (!url) return NextResponse.json({ error: "url_required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const dueDate = payload.dueDate || shiftDays(todayIso(), 2);
  const scraped = await scrapeUrl(parsed.toString());
  const classification = buildArticleClassification(parsed.toString(), scraped.title, scraped.body);

  const article: Article = {
    id: randomUUID(),
    url: parsed.toString(),
    status: "todo",
    addedAt: new Date().toISOString(),
    dueDate,
    completedAt: null,
    ...classification,
  };

  insertArticle(article);
  return NextResponse.json({ article }, { status: 201 });
}
