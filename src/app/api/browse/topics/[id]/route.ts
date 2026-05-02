import { NextResponse } from "next/server";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { deleteBrowseTopic, updateBrowseTopic } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getRouteHandlerUserId();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    keywords?: unknown;
    seedSources?: unknown;
    maxPublishedAgeDays?: unknown;
  };

  const patch: Partial<{
    name: string;
    keywords: string[];
    seedSources: string[];
    maxPublishedAgeDays: number | null;
  }> = {};

  if (typeof body.name === "string") patch.name = body.name;
  if (Array.isArray(body.keywords)) patch.keywords = body.keywords.map(String);
  if (Array.isArray(body.seedSources)) patch.seedSources = body.seedSources.map(String);
  if (body.maxPublishedAgeDays === null) {
    patch.maxPublishedAgeDays = null;
  } else if (typeof body.maxPublishedAgeDays === "number" && Number.isFinite(body.maxPublishedAgeDays)) {
    patch.maxPublishedAgeDays = Math.round(body.maxPublishedAgeDays);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "无有效字段" }, { status: 400 });
  }

  try {
    await updateBrowseTopic(id, uid, patch);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "23505") {
      return NextResponse.json({ error: "与其它主题重名。" }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : "failed";
    if (msg === "db_not_configured") {
      return NextResponse.json({ error: "需要配置 DATABASE_URL。" }, { status: 503 });
    }
    if (msg === "invalid_keywords") {
      return NextResponse.json({ error: "至少保留一个关键词。" }, { status: 400 });
    }
    if (msg === "invalid_seed_sources") {
      return NextResponse.json({ error: "种子来源过长或过多（每行一条，最多 40 条）。" }, { status: 400 });
    }
    if (msg === "invalid_max_age") {
      return NextResponse.json({ error: "可见天数须为 1～3650 之间的整数，或留空用默认。" }, { status: 400 });
    }
    if (msg === "not_found") {
      return NextResponse.json({ error: "主题不存在。" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getRouteHandlerUserId();
  const { id } = await ctx.params;
  try {
    await deleteBrowseTopic(id, uid);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed";
    if (msg === "db_not_configured") {
      return NextResponse.json({ error: "需要配置 DATABASE_URL。" }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
