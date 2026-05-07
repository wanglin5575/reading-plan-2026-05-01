import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import {
  isPreviewSessionAllowed,
  PREVIEW_UI_FOLLOWED_EMAIL,
} from "@/lib/preview-session";

/**
 * 开发环境：社交功能演示入口（被关注者视角）。
 * 已加入 AuthGateOverlay 白名单；顶栏展示已登录样式。
 */
export default function PreviewSocialFollowedPage() {
  const allowed = isPreviewSessionAllowed();

  if (!allowed) {
    return (
      <div className="card" style={{ margin: "1rem" }}>
        <p>
          <strong>演示登录仅开发环境可用</strong>。请在本机运行 <code>npm run dev</code> 后再打开；生产环境请使用真实账号登录。
        </p>
        <p style={{ marginTop: 12 }}>
          <a href="/weekly">前往 /weekly</a>
        </p>
      </div>
    );
  }

  const go = (path: string) => `/preview/go/authed?path=${encodeURIComponent(path)}&role=followed`;

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry
              email={PREVIEW_UI_FOLLOWED_EMAIL}
              isAdmin={false}
              menuTrigger="avatar"
            />
            <h1>社交演示 · 被关注者</h1>
          </div>
          <span className="sub">
            顶栏为<strong>已登录样式</strong>；进入真实数据页请点下方链接写入对应角色的演示 Cookie。
          </span>
        </div>
      </header>

      <div className="card" style={{ margin: "0 1rem 1rem", maxWidth: 640 }}>
        <p className="muted-link" style={{ marginTop: 0 }}>
          须<strong>整页打开</strong> <code className="admin-code-inline">/preview/go/authed?...</code>，勿用会绕过完整重定向链路的客户端软路由。
        </p>
        <p className="muted-link">
          演示身份：<code className="admin-code-inline">{PREVIEW_UI_FOLLOWED_EMAIL}</code>
        </p>
        <ul style={{ lineHeight: 1.8 }}>
          <li>
            <a href={go("/weekly")}>我的复盘（/weekly）</a> — 查看粉丝、红点、昵称
          </li>
          <li>
            <a href={go("/browse")}>随览（/browse）</a>
          </li>
          <li>
            <a href={go("/add")}>添加文章（/add）</a>
          </li>
        </ul>
      </div>
    </>
  );
}
