import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "预览",
  robots: { index: false, follow: false },
};

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return "http://127.0.0.1:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function abs(origin: string, path: string): string {
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export default async function PreviewLinksPage() {
  const origin = await requestOrigin();

  const guestHome = `${origin}/preview/go/guest?path=${encodeURIComponent("/")}`;
  const authedWeekly = `${origin}/preview/go/authed?path=${encodeURIComponent("/weekly")}`;
  const authedRoot = `${origin}/preview/go/authed?path=${encodeURIComponent("/")}`;

  const entries = {
    overview: abs(origin, "/site-preview"),
    guestHome,
    authedWeekly,
    authedRoot,
    weeklyAuthedBookmark: abs(origin, "/weekly-authed-preview"),
    addAuthedBookmark: abs(origin, "/add-authed-preview"),
    demoAuthedSite: abs(origin, "/demo-authed-site-preview"),
    weeklyUi: abs(origin, "/weekly-ui-preview"),
    weeklyNonAdmin: abs(origin, "/weekly-non-admin-preview"),
    nonAdminFull: abs(origin, "/non-admin-full-preview"),
    previewMeAvatarNonAdmin: abs(origin, "/preview-me-avatar-non-admin"),
    previewMeAvatarAdmin: abs(origin, "/preview-me-avatar-admin"),
    loggedInLegacy: abs(origin, "/logged-in-preview"),
    loginPreview: abs(origin, "/login-preview"),
    adminPreview: abs(origin, "/admin-preview"),
    loggedInAdmin: abs(origin, "/logged-in-admin-preview"),
    vipAccounts: abs(origin, "/vip-accounts-preview"),
    browse: abs(origin, "/browse-preview"),
    browseRejected: abs(origin, "/browse-rejected-preview"),
  };

  return (
    <>
      <header className="app-header">
        <h1>预览</h1>
        <span className="sub">本地需先运行 npm run dev；请用系统浏览器打开下列完整链接（优先 127.0.0.1 或 localhost，勿用 0.0.0.0）</span>
      </header>

      <div className="card">
        <p className="muted-link" style={{ margin: "0 0 16px", fontSize: "var(--fs-small)", lineHeight: 1.5 }}>
          <strong>环境与限制</strong>：终端出现 Ready 后再访问。使用 <code className="admin-code-inline">npm run start</code>（生产模式）时，{" "}
          <code className="admin-code-inline">/preview/go/authed</code> 会返回 403，依赖「演示登录」Cookie 的链路也可能不可用；本地预览请以{" "}
          <code className="admin-code-inline">npm run dev</code> 为准。<code className="admin-code-inline">/preview/go/*</code>{" "}
          请地址栏打开或 <code className="admin-code-inline">target=&quot;_top&quot;</code> 整页跳转，勿依赖仅客户端路由的软跳转。
        </p>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>总览 · 书签入口</h2>
          <p className="muted-link" style={{ margin: "0 0 8px", fontSize: "var(--fs-small)" }}>
            本页汇总仓库内全部本地预览 / 演示页；可收藏此地址作为入口。
          </p>
          <div>
            <a href={entries.overview} className="site-preview-link" target="_top" rel="noopener noreferrer">
              {entries.overview}
            </a>
            <span className="muted-link" style={{ marginLeft: 8, fontSize: "var(--fs-small)" }}>
              （/site-preview · 当前页）
            </span>
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>未登录 / 清除演示态</h2>
          <p className="muted-link" style={{ margin: "0 0 8px", fontSize: "var(--fs-small)" }}>
            路由处理器：清除「演示登录」Cookie 后重定向到 <code className="admin-code-inline">path</code> 指定站内路径（不影响真实 Supabase / VIP 会话）。可通过{" "}
            <code className="admin-code-inline">path</code> 指向任意允许的路径。
          </p>
          <div>
            <a href={entries.guestHome} className="site-preview-link" target="_top" rel="noopener noreferrer">
              {entries.guestHome}
            </a>
            <span className="muted-link" style={{ marginLeft: 8, fontSize: "var(--fs-small)" }}>
              （/preview/go/guest → 首页示例）
            </span>
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>已登录演示</h2>
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)", lineHeight: 1.5 }}>
            <strong>/preview/go/authed</strong>：仅开发环境可用；设置「演示登录」Cookie 后跳转（演示邮箱{" "}
            <code className="admin-code-inline">ui-preview@login-state.local</code>）。生产 / <code className="admin-code-inline">npm run start</code>{" "}
            下返回 403。若浏览器已有真实 Supabase 会话，仍以真实用户为准。
          </p>
          <ul className="muted-link" style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
            <li style={{ marginBottom: 10 }}>
              <strong>跳转处理器（推荐）</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.authedWeekly} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.authedWeekly}
                </a>
                <span style={{ fontSize: "var(--fs-small)" }}> — /weekly（我的复盘）</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <a href={entries.authedRoot} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.authedRoot}
                </a>
                <span style={{ fontSize: "var(--fs-small)" }}> — 首页 /</span>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>书签入口 · 我的复盘</strong>（与上列 authed 链路等价，便于记忆）
              <div style={{ marginTop: 4 }}>
                <a href={entries.weeklyAuthedBookmark} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.weeklyAuthedBookmark}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>书签入口 · 添加页</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.addAuthedBookmark} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.addAuthedBookmark}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 0 }}>
              <strong>主站多页可交互演示</strong>（待读 / 添加 / 已读 / 我的；不落库）
              <div style={{ marginTop: 4 }}>
                <a href={entries.demoAuthedSite} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.demoAuthedSite}
                </a>
              </div>
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>静态 UI · 整页样式</h2>
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)", lineHeight: 1.5 }}>
            下列页面<strong>不是</strong>真实「演示已登录」态；要看写 Cookie 后的效果请用上一节「已登录演示」。
          </p>
          <ul className="muted-link" style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
            <li style={{ marginBottom: 10 }}>
              <strong>周复盘整页静态 UI</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.weeklyUi} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.weeklyUi}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>我的复盘 · 非管理员菜单与交互说明</strong>（强制 <code className="admin-code-inline">isAdmin=false</code>）
              <div style={{ marginTop: 4 }}>
                <a href={entries.weeklyNonAdmin} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.weeklyNonAdmin}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>非管理员 ·「我的复盘」+「查看token消耗」弹层（合并）</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.nonAdminFull} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.nonAdminFull}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>账号菜单 · 非管理员</strong>（小人图标菜单默认展开 + token 弹层示意）
              <div style={{ marginTop: 4 }}>
                <a href={entries.previewMeAvatarNonAdmin} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.previewMeAvatarNonAdmin}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>账号菜单 · 管理员</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.previewMeAvatarAdmin} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.previewMeAvatarAdmin}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 0 }}>
              <strong>旧路径（永久重定向）</strong>
              <code className="admin-code-inline">/logged-in-preview</code> → <code className="admin-code-inline">/weekly-ui-preview</code>
              <div style={{ marginTop: 4 }}>
                <a href={entries.loggedInLegacy} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.loggedInLegacy}
                </a>
              </div>
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>登录页演示</h2>
          <p className="muted-link" style={{ margin: "0 0 8px", fontSize: "var(--fs-small)" }}>
            登录界面与相关说明的独立预览入口。
          </p>
          <div>
            <a href={entries.loginPreview} className="site-preview-link" target="_top" rel="noopener noreferrer">
              {entries.loginPreview}
            </a>
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>管理后台演示</h2>
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)", lineHeight: 1.5 }}>
            本地可交互 UI、不接真实接口。真实数据请登录后访问 <code className="admin-code-inline">/admin</code>。
          </p>
          <ul className="muted-link" style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
            <li style={{ marginBottom: 10 }}>
              <strong>管理后台（通用演示）</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.adminPreview} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.adminPreview}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 10 }}>
              <strong>模拟已登录 · 完整 Tab</strong>（与 <code className="admin-code-inline">/admin-preview</code> 能力相同，入口文案不同）
              <div style={{ marginTop: 4 }}>
                <a href={entries.loggedInAdmin} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.loggedInAdmin}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 0 }}>
              <strong>仅 VIP 账号管理</strong>（无 Tab，便于窄屏）
              <div style={{ marginTop: 4 }}>
                <a href={entries.vipAccounts} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.vipAccounts}
                </a>
              </div>
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 8 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>随览 · 发现 / 筛除 UI</h2>
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
            浏览主题列表与「AI 筛除」相关界面的本地样式预览。
          </p>
          <ul className="muted-link" style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
            <li style={{ marginBottom: 10 }}>
              <strong>发现 / 主题浏览</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.browse} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.browse}
                </a>
              </div>
            </li>
            <li style={{ marginBottom: 0 }}>
              <strong>AI 筛除条目</strong>
              <div style={{ marginTop: 4 }}>
                <a href={entries.browseRejected} className="site-preview-link" target="_top" rel="noopener noreferrer">
                  {entries.browseRejected}
                </a>
              </div>
            </li>
          </ul>
        </section>

        <p className="muted-link" style={{ margin: "20px 0 0", fontSize: "var(--fs-small)" }}>
          <strong>src/app 下 *-preview 页面路由</strong>已尽列于此；另有{" "}
          <code className="admin-code-inline">/preview/go/guest</code> 与 <code className="admin-code-inline">/preview/go/authed</code>{" "}
          为 Route Handler（见上一节）。API <code className="admin-code-inline">/api/read-preview</code> 供文章阅读摘要演示调用，非独立浏览页。
        </p>
      </div>
    </>
  );
}
