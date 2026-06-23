import { NextResponse } from "next/server";
import { getXhsMcpBaseUrl } from "@/lib/browse-xhs-mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 代理小红书 MCP 登录二维码（供 /xhs-login 页面展示） */
export async function GET() {
  const base = getXhsMcpBaseUrl();
  if (!base) {
    return NextResponse.json({ error: "未配置 XHS_MCP_BASE_URL" }, { status: 503 });
  }

  try {
    const res = await fetch(`${base}/api/v1/login/qrcode`, {
      signal: AbortSignal.timeout(120_000),
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json(
      {
        error:
          msg.includes("ECONNREFUSED") || msg.includes("fetch failed")
            ? "小红书 MCP 未启动。请先在终端运行：bash scripts/start-xhs-mcp-mac.sh"
            : msg,
      },
      { status: 502 },
    );
  }
}
