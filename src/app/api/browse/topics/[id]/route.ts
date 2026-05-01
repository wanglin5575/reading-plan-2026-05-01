import { NextResponse } from "next/server";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { deleteBrowseTopic, updateBrowseTopic } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getRouteHandlerUserId();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; keywords?: unknown };
  try {
    if (typeof body.name === "string" && Array.isArray(body.keywords)) {
      await updateBrowseTopic(id, uid, { name: body.name, keywords: body.keywords.map(String) });
    } else if (typeof body.name === "string") {
      await updateBrowseTopic(id, uid, { name: body.name });
    } else if (Array.isArray(body.keywords)) {
      await updateBrowseTopic(id, uid, { keywords: body.keywords.map(String) });
    } else {
      return NextResponse.json({ error: "无有效字段" }, { status: 400 });
    }
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
