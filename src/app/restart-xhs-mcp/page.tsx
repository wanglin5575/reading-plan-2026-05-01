"use client";

import { useCallback, useEffect, useState } from "react";

type StatusPayload = {
  configured?: boolean;
  reachable?: boolean;
  loggedIn?: boolean;
  message?: string | null;
};

export default function RestartXhsMcpPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const st = await fetch("/api/browse/xhs-mcp/status").then((r) => r.json() as Promise<StatusPayload>);
      setStatus(st);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const allOk = status?.configured && status.reachable && status.loggedIn;

  return (
    <main className="page" style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: 8 }}>重启小红书 MCP</h1>
      <p className="muted-link" style={{ marginBottom: 20 }}>
        随览抓取博主主页时，若提示「数据未加载」「MCP 未登录」或「服务不可用」，请在本机 Mac 按下列步骤操作。线上站点依赖本机
        MCP 与 ngrok，Mac 休眠或关闭窗口后需重新执行。
      </p>

      {loading && <p>正在检测 MCP 连接状态…</p>}

      {!loading && err && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "#e57373" }}>
          <p style={{ margin: 0 }}>{err}</p>
        </div>
      )}

      {!loading && !err && status && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem" }}>当前状态</h2>
          <ul className="muted-link" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Vercel 已配置 MCP 地址：{status.configured ? "是 ✓" : "否 ✗"}</li>
            <li>公网 MCP 可达：{status.reachable ? "是 ✓" : "否 ✗"}</li>
            <li>小红书已登录：{status.loggedIn ? "是 ✓" : "否 ✗"}</li>
          </ul>
          {status.message && !allOk ? (
            <p className="muted-link" style={{ marginTop: 12, marginBottom: 0, fontSize: "var(--fs-small)" }}>
              {status.message}
            </p>
          ) : null}
          {allOk ? (
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              三项均为 ✓ 时，可回到 <a href="/browse">随览</a> 刷新小红书订阅。
            </p>
          ) : null}
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem" }}>Mac 上操作（需两个窗口保持打开）</h2>
        <ol className="muted-link" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            打开终端，进入项目目录后启动 MCP：
            <pre style={{ overflow: "auto", fontSize: "var(--fs-small)", margin: "8px 0" }}>
              {`cd "/Users/wuwanlin/Cursor Projects/reading-plan-2026-05-01"\nbash scripts/start-xhs-mcp-mac.sh`}
            </pre>
            若出现「使用 patched MCP」更佳；若报 <code>address already in use</code> 表示已在运行，可跳过。
          </li>
          <li>
            另开终端启动 ngrok（线上必需）：
            <pre style={{ overflow: "auto", fontSize: "var(--fs-small)", margin: "8px 0" }}>
              ~/bin/ngrok http 18060
            </pre>
            若 ngrok 地址变了，到 Vercel → Environment Variables → 更新 <code>XHS_MCP_BASE_URL</code> 后 Redeploy。
          </li>
          <li>
            若随览曾报「dom not stable」，先构建 patched MCP 再重启窗口 A：
            <pre style={{ overflow: "auto", fontSize: "var(--fs-small)", margin: "8px 0" }}>
              bash scripts/build-xhs-mcp-patched-mac.sh
            </pre>
          </li>
          <li>
            完成上述步骤后，打开 <a href="/xhs-login">/xhs-login</a> 用小红书 App 扫码登录（Cookie 失效时需重做）。
          </li>
          <li>回到 <a href="/browse">随览</a>，刷新「订阅小红书」主题。</li>
        </ol>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>常见现象</h2>
        <ul className="muted-link" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>博主主页数据未加载 → 多为未登录，先 /xhs-login 扫码</li>
          <li>Failed to fetch / 获取二维码失败 → MCP 或 ngrok 窗口已关</li>
          <li>dom not stable → 执行 build-xhs-mcp-patched-mac.sh 后重启 MCP</li>
          <li>playwright / 1148 报错 → bash scripts/install-xhs-mcp-playwright-mac.sh</li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>
          重新检测状态
        </button>
        <a className="btn secondary" href="/xhs-login">
          去扫码登录
        </a>
        <a className="btn secondary" href="/browse">
          去随览
        </a>
      </div>
    </main>
  );
}
