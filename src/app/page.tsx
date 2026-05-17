import { countFansSince, ensureUserProfile, listArticlesForUser } from "@/lib/db";
import { buildDailyPlan } from "@/lib/plan";
import { TodoPageClient } from "@/components/TodoPageClient";
import { getServerAuthUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getServerAuthUser();
  const all = await listArticlesForUser(user?.id ?? null);
  const plan = buildDailyPlan(all);
  const unread = all.filter((a) => a.status === "todo");
  const profile = user?.id ? await ensureUserProfile(user.id) : null;
  const fanUnreadCount =
    user?.id && profile ? await countFansSince(user.id, profile.lastFansSeenAt) : 0;

  return (
    <TodoPageClient
      items={unread}
      planTotalMinutes={plan.totalMinutes}
      planTodayCount={plan.items.length}
      deepCount={plan.deepCount}
      skimCount={plan.skimCount}
      signedIn={Boolean(user?.email)}
      accountEmail={user?.email ?? null}
      isAdmin={isAdminEmail(user?.email)}
      fanUnreadCount={fanUnreadCount}
    />
  );
}
