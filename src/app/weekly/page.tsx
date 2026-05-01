import { listArticles } from "@/lib/db";
import { startOfWeekIso, todayIso } from "@/lib/plan";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const articles = await listArticles();

  return (
    <>
      <header className="app-header">
        <h1>复盘</h1>
        <span className="sub">按自然周或按日浏览历史，查看知识点与复盘建议</span>
      </header>

      <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />
    </>
  );
}
