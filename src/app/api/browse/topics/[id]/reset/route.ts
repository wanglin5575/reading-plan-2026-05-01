import { NextResponse } from "next/server";
import { getRouteHandlerUserId } from "@/lib/auth/api";
import { clearBrowseTopicFeed, getBrowseTopic, isDatabaseConfigured } from "@/lib/db";
import { isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 重置当前主题：清空服务端缓存的链接与时间戳（下次下拉按首次规则重新拉取） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getRouteHandlerUserId();
  if (isAuthEnabled() && !uid) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: true, localOnly: true }, { status: 200 });
  }

  const topic = await getBrowseTopic(id, uid);
  if (!topic) {
    return NextResponse.json({ error: "主题不存在。" }, { status: 404 });
  }

  try {
    await clearBrowseTopicFeed(uid, id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "db_not_configured") {
      return NextResponse.json({ ok: true, localOnly: true });
    }
    return NextResponse.json({ error: msg || "failed" }, { status: 500 });
  }
}
