import { listArticles } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";
import { AddArticleForm } from "@/components/AddArticleForm";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const all = await listArticles();
  const plan = buildDailyPlan(all);

  return (
    <>
      <header className="app-header">
        <h1>添加</h1>
        <span className="sub">粘贴链接后自动抓取、识别主题并生成中文大意</span>
      </header>

      <AddArticleForm />

      {plan.themesToday.length > 0 && (
        <div className="card">
          <h2>本周重点方向</h2>
          <div className="theme-list">
            {plan.themesToday.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
