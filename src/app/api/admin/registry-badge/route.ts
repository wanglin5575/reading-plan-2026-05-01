import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { countRegistryUsersRegisteredAfter, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 管理员头像红点：查询自 since（上次确认时间）以来 app_user_registry 新增人数。
 * 无 since 时返回 initBaseline，客户端应用 serverNow 作为首次基准（不报历史人数）。
 */
export async function GET(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.email || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const serverNow = new Date().toISOString();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ newCount: 0, serverNow, initBaseline: true });
  }

  const since = new URL(req.url).searchParams.get("since")?.trim();
  if (!since) {
    return NextResponse.json({ newCount: 0, serverNow, initBaseline: true });
  }

  const newCount = await countRegistryUsersRegisteredAfter(since);
  return NextResponse.json({ newCount, serverNow, initBaseline: false });
}
