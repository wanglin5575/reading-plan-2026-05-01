"use client";

import { useCallback, useEffect, useState } from "react";

type StatusPayload = {
  configured?: boolean;
  reachable?: boolean;
  loggedIn?: boolean;
  message?: string | null;
};

type QrPayload = {
  success?: boolean;
  message?: string;
  data?: {
    is_logged_in?: boolean;
    status?: string;
    qrcode?: string;
    img?: string;
    image?: string;
    qr_code?: string;
    [key: string]: unknown;
  };
  error?: string;
};

function pickQrSrc(data: QrPayload["data"]): string | null {
  if (!data) return null;
  for (const k of ["qrcode", "img", "image", "qr_code", "qrcode_base64"] as const) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      if (t.startsWith("data:image")) return t;
      if (t.startsWith("http")) return t;
      return `data:image/png;base64,${t}`;
    }
  }
  return null;
}

export default function XhsLoginPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const st = await fetch("/api/browse/xhs-mcp/status").then((r) => r.json() as Promise<StatusPayload>);
      setStatus(st);

      if (st.loggedIn) {
        setQr(null);
        return;
      }

      const qrRes = await fetch("/api/browse/xhs-mcp/qrcode").then(async (r) => {
        const j = (await r.json()) as QrPayload;
        if (!r.ok) {
          const detail = j.error || j.message || `HTTP ${r.status}`;
          throw new Error(detail);
        }
        return j;
      });
      setQr(qrRes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loggedIn = status?.loggedIn || qr?.data?.is_logged_in || qr?.data?.status === "logged_in";
  const qrSrc = pickQrSrc(qr?.data);

  return (
    <main className="page" style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: 8 }}>小红书 MCP 登录</h1>
      <p className="muted-link" style={{ marginBottom: 20 }}>
        随览抓取小红书博主笔记前，需在此完成一次登录。登录态保存在本机 MCP 服务中。
      </p>

      {loading && <p>正在连接小红书服务…（首次可能需 1～2 分钟，请稍候）</p>}

      {!loading && err && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "#e57373" }}>
          <p style={{ margin: 0 }}>{err}</p>
          <p className="muted-link" style={{ marginTop: 12, marginBottom: 0, fontSize: "var(--fs-small)" }}>
            线上站点（vercel.app）还需 Mac 上同时运行 ngrok（<code>ngrok http 18060</code>），并在 Vercel 配好{" "}
            <code>XHS_MCP_BASE_URL</code>。本机调试可改用{" "}
            <a href="http://127.0.0.1:3000/xhs-login">http://127.0.0.1:3000/xhs-login</a>（需先{" "}
            <code>npm run dev</code>）。
          </p>
        </div>
      )}

      {!loading && !err && status && (
        <ul className="muted-link" style={{ marginBottom: 20, paddingLeft: 18 }}>
          <li>MCP 已配置：{status.configured ? "是" : "否"}</li>
          <li>服务可达：{status.reachable ? "是" : "否"}</li>
          <li>已登录小红书：{loggedIn ? "是 ✓" : "否"}</li>
        </ul>
      )}

      {!loading && !err && loggedIn && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0 }}>已登录，无需再扫码。</p>
          <p className="muted-link" style={{ marginTop: 8, marginBottom: 0 }}>
            请打开 <a href="/browse">随览</a>，在种子站填入博主链接后刷新主题。
          </p>
        </div>
      )}

      {!loading && !err && !loggedIn && qrSrc && (
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <p style={{ marginTop: 0 }}>请用小红书 App 扫描下方二维码</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="小红书登录二维码" style={{ maxWidth: 280, width: "100%" }} />
        </div>
      )}

      {!loading && !err && !loggedIn && !qrSrc && qr && (
        <div className="card" style={{ padding: 16 }}>
          <p style={{ marginTop: 0 }}>接口已响应，但未返回可展示的二维码图片。</p>
          <p className="muted-link" style={{ marginBottom: 0, fontSize: "var(--fs-small)" }}>
            可在终端执行：curl -s http://127.0.0.1:18060/api/v1/login/qrcode
            <br />
            或确认 MCP 服务版本支持二维码接口。
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>
          刷新状态
        </button>
        <a className="btn secondary" href="/browse">
          去随览
        </a>
      </div>
    </main>
  );
}
