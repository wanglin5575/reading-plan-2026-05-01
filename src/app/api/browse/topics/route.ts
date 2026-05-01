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
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; keywords?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  const keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : [];
  try {
    const topic = await insertBrowseTopic(uid, name, keywords);
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
