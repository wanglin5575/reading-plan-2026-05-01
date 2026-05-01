import { NextResponse } from "next/server";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import type { BrowseTopicFeed, BrowseStoredHit } from "@/lib/browse-storage";
import {
  getBrowseTopic,
  getBrowseTopicFeed,
  isDatabaseConfigured,
  upsertBrowseTopicFeed,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 2500;

function parseFeedPayload(raw: unknown): BrowseTopicFeed | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let lastRefreshAt: string | null = null;
  if (o.lastRefreshAt === undefined || o.lastRefreshAt === null) {
    lastRefreshAt = null;
  } else if (typeof o.lastRefreshAt === "string") {
    lastRefreshAt = o.lastRefreshAt;
  } else {
    return null;
  }
  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items: BrowseStoredHit[] = [];
  for (const x of itemsRaw.slice(0, MAX_ITEMS)) {
    if (!x || typeof x !== "object") continue;
    const u = (x as { url?: unknown }).url;
    if (typeof u !== "string" || !u.trim()) continue;
    items.push(x as BrowseStoredHit);
  }
  return { lastRefreshAt, items };
}

export async function GET(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, sync: false, error: "db_not_configured" }, { status: 503 });
  }
  const uid = await getRouteHandlerUserId();
  const { searchParams } = new URL(req.url);
  const topicId = searchParams.get("topicId")?.trim() ?? "";
  if (!topicId) return NextResponse.json({ error: "缺少 topicId" }, { status: 400 });

  const topic = await getBrowseTopic(topicId, uid);
  if (!topic) return NextResponse.json({ error: "主题不存在" }, { status: 404 });

  const row = await getBrowseTopicFeed(uid, topicId);
  const feed: BrowseTopicFeed = row ?? { lastRefreshAt: null, items: [] };
  return NextResponse.json({ ok: true, sync: true, feed });
}

export async function PUT(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, sync: false, error: "db_not_configured" }, { status: 503 });
  }
  const uid = await getRouteHandlerUserId();
  const body = (await req.json().catch(() => ({}))) as {
    topicId?: unknown;
    feed?: unknown;
  };
  const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
  if (!topicId) return NextResponse.json({ error: "缺少 topicId" }, { status: 400 });

  const topic = await getBrowseTopic(topicId, uid);
  if (!topic) return NextResponse.json({ error: "主题不存在" }, { status: 404 });

  const feed = parseFeedPayload(body.feed);
  if (!feed) return NextResponse.json({ error: "feed 格式无效" }, { status: 400 });

  try {
    await upsertBrowseTopicFeed(uid, topicId, feed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    if (msg === "db_not_configured") {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[browse/feed] upsert failed:", e);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
