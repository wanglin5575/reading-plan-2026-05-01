import { listArticles } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";
import { TodoGroupedList } from "@/components/TodoGroupedList";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const all = await listArticles();
  const plan = buildDailyPlan(all);
  const unread = all.filter((a) => a.status === "todo");

  return (
    <>
      <header className="app-header">
        <h1>待读</h1>
        <span className="sub">共 {unread.length} 篇 · 今日建议 {plan.items.length} 篇 · 约 {plan.totalMinutes} 分钟</span>
      </header>

      <section className="kpi-grid">
        <div className="kpi">
          <div className="label">今日建议用时</div>
          <div className="value">{plan.totalMinutes}<span className="text-unit">分钟</span></div>
        </div>
        <div className="kpi">
          <div className="label">待读篇数</div>
          <div className="value">{unread.length}</div>
        </div>
        <div className="kpi">
          <div className="label">重点精读</div>
          <div className="value">{plan.deepCount}</div>
        </div>
        <div className="kpi">
          <div className="label">快速扫览</div>
          <div className="value">{plan.skimCount}</div>
        </div>
      </section>

      {plan.themesToday.length > 0 && (
        <div className="card">
          <h2>今天会获得</h2>
          <div className="theme-list" style={{ marginBottom: 8 }}>
            {plan.themesToday.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
          <p className="review-advice">{plan.knowledgePromise}</p>
        </div>
      )}

      <h3 className="section-title">待读列表（按期望完成时间）</h3>
      <TodoGroupedList items={unread} />
    </>
  );
}
