import { NextResponse } from "next/server";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { insertBrowseTopic, listBrowseTopics } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getRouteHandlerUserId();
  const topics = await listBrowseTopics(uid);
  return NextResponse.json({ topics });
}

export async function POST(req: Request) {
  const uid = await getRouteHandlerUserId();
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    keywords?: unknown;
    seedSources?: unknown;
    maxPublishedAgeDays?: unknown;
  };
  const name = typeof body.name === "string" ? body.name : "";
  const keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : [];
  const seedSources = Array.isArray(body.seedSources) ? body.seedSources.map(String) : undefined;
  let maxPublishedAgeDays: number | null | undefined;
  if (body.maxPublishedAgeDays === null) maxPublishedAgeDays = null;
  else if (typeof body.maxPublishedAgeDays === "number" && Number.isFinite(body.maxPublishedAgeDays)) {
    maxPublishedAgeDays = Math.round(body.maxPublishedAgeDays);
  }
  try {
    const topic = await insertBrowseTopic(uid, name, keywords, {
      seedSources,
      maxPublishedAgeDays,
    });
    return NextResponse.json({ topic });
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "23505") {
      return NextResponse.json({ error: "已存在同名主题，请换一个名称。" }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : "failed";
    if (msg === "db_not_configured") {
      return NextResponse.json({ error: "需要配置 DATABASE_URL 才能新增或编辑主题。" }, { status: 503 });
    }
    if (msg === "invalid_name" || msg === "invalid_keywords") {
      return NextResponse.json({ error: "请填写主题名称和至少一个关键词。" }, { status: 400 });
    }
    if (msg === "invalid_seed_sources") {
      return NextResponse.json({ error: "种子来源过长或过多。" }, { status: 400 });
    }
    if (msg === "invalid_max_age") {
      return NextResponse.json({ error: "可见天数须为 1～3650 之间的整数。" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
