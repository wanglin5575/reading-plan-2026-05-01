import { listArticles } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";
import { AddArticleForm } from "@/components/AddArticleForm";
import { ArticleCard } from "@/components/ArticleCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const all = await listArticles();
  const plan = buildDailyPlan(all);

  return (
    <>
      <header className="app-header">
        <h1>今日阅读</h1>
        <span className="sub">{plan.date} · {plan.items.length} 篇待读 · 约 {plan.totalMinutes} 分钟</span>
      </header>

      <AddArticleForm />

      <section className="kpi-grid">
        <div className="kpi">
          <div className="label">总用时</div>
          <div className="value">{plan.totalMinutes}<span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>分钟</span></div>
        </div>
        <div className="kpi">
          <div className="label">待读篇数</div>
          <div className="value">{plan.items.length}</div>
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
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{plan.knowledgePromise}</p>
        </div>
      )}

      <h3 className="section-title">待读列表（按截止日期排序）</h3>
      {plan.items.length === 0 ? (
        <div className="empty">今天的安排已读完，加几条新链接吧。</div>
      ) : (
        plan.items.map((article) => <ArticleCard key={article.id} article={article} />)
      )}
    </>
  );
}
