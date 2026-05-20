import { NextResponse } from "next/server";
import { getXhsMcpBaseUrl, getXhsMcpLoginStatus } from "@/lib/browse-xhs-mcp";

export const dynamic = "force-dynamic";

/** 检查小红书 MCP 侧车是否可达、是否已登录（随览调试 / 设置页用） */
export async function GET() {
  const baseUrl = getXhsMcpBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      loggedIn: false,
      message: "未配置 XHS_MCP_BASE_URL",
    });
  }

  const status = await getXhsMcpLoginStatus();
  return NextResponse.json({
    configured: true,
    baseUrl,
    reachable: !status.message?.includes("ECONNREFUSED") && !status.message?.includes("fetch failed"),
    loggedIn: status.loggedIn,
    message: status.message ?? null,
  });
}
