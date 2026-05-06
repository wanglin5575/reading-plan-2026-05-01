import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "演示已登录 · 主站入口",
  robots: { index: false, follow: false },
};

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return "http://127.0.0.1:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

const ENTRIES: { path: string; label: string; hint?: string }[] = [
  { path: "/", label: "待读首页" },
  { path: "/add", label: "添加链接", hint: "提交添加后，成功卡片与待读列表样式一致、可点击标题。" },
  { path: "/read", label: "已读" },
  { path: "/weekly", label: "我的复盘" },
];

export default async function DemoAuthedSitePreviewPage() {
  const origin = await requestOrigin();

  return (
    <>
      <header className="app-header">
        <h1>演示已登录 · 主站</h1>
        <span className="sub">
          仅 <code className="admin-code-inline">npm run dev</code> 有效；每条链整页打开后写入演示 Cookie 并进入对应页（演示邮箱
          ui-preview@login-state.local）
        </span>
      </header>

      <div className="card">
        <p className="muted-link" style={{ marginTop: 0 }}>
          本页为<strong>入口汇总</strong>。请勿用 <code className="admin-code-inline">0.0.0.0</code> 作浏览器地址；链接须
          <strong>整页</strong>打开（<code className="admin-code-inline">target=&quot;_top&quot;</code> 或地址栏粘贴）。
        </p>
        <ul className="preview-three-links muted-link">
          {ENTRIES.map(({ path, label, hint }) => {
            const href = `${origin}/preview/go/authed?path=${encodeURIComponent(path)}`;
            return (
              <li key={path} style={{ marginTop: 16 }}>
                <strong>{label}</strong>
                {hint ? (
                  <p className="muted-link" style={{ margin: "6px 0 0", fontSize: "var(--fs-small)" }}>
                    {hint}
                  </p>
                ) : null}
                <div>
                  <a href={href} className="site-preview-link" target="_top" rel="noopener noreferrer">
                    {href}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="muted-link" style={{ margin: "16px 0 0", fontSize: "var(--fs-small)" }}>
          返回总览：<a href="/site-preview">/site-preview</a>
        </p>
      </div>
    </>
  );
}
