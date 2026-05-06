import type { Metadata } from "next";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";
import { buildLoggedInPreviewArticles } from "@/lib/logged-in-preview-articles";
import { startOfWeekIso, todayIso } from "@/lib/plan";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";

export const metadata: Metadata = {
  title: "我的复盘 · 非管理员预览",
  robots: { index: false, follow: false },
};

/** 故意不用管理员邮箱；无「管理后台」入口 */
const DEMO_EMAIL = "non-admin-weekly-preview@login-state.local";

export default function WeeklyNonAdminPreviewPage() {
  const articles = buildLoggedInPreviewArticles();

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry email={DEMO_EMAIL} isAdmin={false} menuTrigger="avatar" defaultMenuOpen />
            <h1>我的复盘</h1>
          </div>
          <span className="sub">静态 UI + 演示数据；强制非管理员菜单文案（与真实会话无关）</span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="muted-link" style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>
          非管理员 · 本页交互说明（可对照点击）
        </p>
        <ul className="muted-link" style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.55 }}>
          <li>
            <strong>头像按钮</strong>：展开账号菜单。演示邮箱见上；无红点（仅管理员拉注册红点）。
          </li>
          <li>
            <strong>查看token消耗</strong>：打开弹层，列表维度与管理员「会员与用量」一致，<strong>不展示邮箱列</strong>；数据为当前登录用户可见范围。非管理员无法访问{" "}
            <code className="admin-code-inline">/admin</code>。
          </li>
          <li>
            <strong>修改密码</strong>：打开改密弹层（Supabase 账号；演示邮箱无真实会话时保存可能失败，属预期）。
          </li>
          <li>
            <strong>退出登录</strong>：走 Supabase 登出 + 刷新；演示环境可能提示错误，属预期。
          </li>
          <li>
            <strong>周条某一天</strong>：切换为<strong>按日</strong>视图，KPI 变为「当日读完 / 阅读时长」，下方列表为当日已读。
          </li>
          <li>
            <strong>上一周 / 下一周</strong>：平移自然周（下一周在「已在本周」时禁用）；并回到<strong>按周</strong>汇总视图。
          </li>
          <li>
            <strong>本周</strong>：回到含今日的自然周（在按日查看或翻到历史周时出现）。
          </li>
          <li>
            <strong>日历图标</strong>：展开月历；选日期 → 按日查看并对齐该日所在周。
          </li>
          <li>
            <strong>跳到今日</strong>：按日 + 今日 + 周对齐到本周。
          </li>
          <li>
            <strong>行动回顾</strong>：勾选框仅本地记忆，不请求接口。
          </li>
          <li>
            <strong>文章标题</strong>：点击打开 AI 摘要弹层；长按约 0.55s 复制原文链接。
          </li>
        </ul>
        <p className="muted-link" style={{ margin: "12px 0 0", fontSize: "var(--fs-small)" }}>
          真实非管理员「我的」：开发环境可{" "}
          <a href="/preview/go/authed?path=%2Fweekly">/preview/go/authed?path=/weekly</a>（演示用户默认非管理员）。
        </p>
      </div>

      <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />
    </>
  );
}
