import { listArticlesForUser } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";
import { TodoPageClient } from "@/components/TodoPageClient";
import { getServerAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getServerAuthUser();
  const all = await listArticlesForUser(user?.id ?? null);
  const plan = buildDailyPlan(all);
  const unread = all.filter((a) => a.status === "todo");

  return (
    <TodoPageClient
      items={unread}
      planTotalMinutes={plan.totalMinutes}
      planTodayCount={plan.items.length}
      deepCount={plan.deepCount}
      skimCount={plan.skimCount}
      signedIn={Boolean(user?.email)}
    />
  );
}
