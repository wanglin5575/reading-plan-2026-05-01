import { listArticles } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";
import { TodoPageClient } from "@/components/TodoPageClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const all = await listArticles();
  const plan = buildDailyPlan(all);
  const unread = all.filter((a) => a.status === "todo");

  return (
    <TodoPageClient
      items={unread}
      planTotalMinutes={plan.totalMinutes}
      planTodayCount={plan.items.length}
      deepCount={plan.deepCount}
      skimCount={plan.skimCount}
    />
  );
}
