import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import {
  isPreviewSessionAllowed,
  PREVIEW_UI_FOLLOWER_EMAIL,
} from "@/lib/preview-session";

/**
 * 开发环境：社交功能演示入口（关注者视角）。
 * 1) 已加入 AuthGateOverlay 白名单，避免无 Cookie 时被全屏登录蒙层挡住。
 * 2) 顶栏使用与「我的」一致的 WeeklyAccountEntry，展示已登录样式（菜单为客户端演示数据，部分接口需先点下方链接写入演示 Cookie）。
 */
export default function PreviewSocialFollowerPage() {
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

  const go = (path: string) => `/preview/go/authed?path=${encodeURIComponent(path)}&role=follower`;

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry
              email={PREVIEW_UI_FOLLOWER_EMAIL}
              isAdmin={false}
              menuTrigger="avatar"
            />
            <h1>社交演示 · 关注者</h1>
          </div>
          <span className="sub">
            顶栏为<strong>已登录样式</strong>；要加载真实复盘数据与接口会话，请用下方<strong>整页链接</strong>写入演示 Cookie。
          </span>
        </div>
      </header>

      <div className="card" style={{ margin: "0 1rem 1rem", maxWidth: 640 }}>
        <p className="muted-link" style={{ marginTop: 0 }}>
          下列入口须用原生 <code className="admin-code-inline">&lt;a&gt;</code> 整页打开（已如此实现），否则{" "}
          <code className="admin-code-inline">/preview/go/authed</code> 的 httpOnly Cookie 可能无法写入。
        </p>
        <p className="muted-link">
          演示身份：<code className="admin-code-inline">{PREVIEW_UI_FOLLOWER_EMAIL}</code>
        </p>
        <ul style={{ lineHeight: 1.8 }}>
          <li>
            <a href={go("/weekly")}>我的复盘（/weekly）</a> — 小人菜单、昵称标题、KPI
          </li>
          <li>
            <a href={go("/browse")}>随览（/browse）</a> — 主题 / 关注 Tab
          </li>
          <li>
            <a href={go("/add")}>添加文章（/add）</a>
          </li>
          <li>
            <a href={go("/all")}>全部文章（/all）</a>
          </li>
        </ul>
      </div>
    </>
  );
}
