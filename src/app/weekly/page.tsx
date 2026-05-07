import {
  listArticlesForUser,
  ensureUserProfile,
  sumTokenUsageForSingleUser,
  sumTokenUsageDaysForUser,
  countFansSince,
} from "@/lib/db";
import { shiftDays, startOfWeekIso, todayIso } from "@/lib/plan";
import { isAdminEmail } from "@/lib/admin";
import { getServerAuthUser } from "@/lib/auth/server";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";
import { WeeklyAccountEntry } from "@/components/WeeklyAccountEntry";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const user = await getServerAuthUser();
  const articles = await listArticlesForUser(user?.id ?? null);
  const profile = user?.id ? await ensureUserProfile(user.id) : null;

  const weekStart = startOfWeekIso();
  const weekEnd = shiftDays(weekStart, 6);
  const historyDoneCount = articles.filter((a) => a.status === "done").length;

  let totalTokenUsd = 0;
  let weekTokenUsd = 0;
  if (user?.id) {
    const mine = await sumTokenUsageForSingleUser(user.id);
    totalTokenUsd = mine?.totalCostUsd ?? 0;
    const days = await sumTokenUsageDaysForUser(user.id);
    for (const d of days) {
      if (d.day >= weekStart && d.day <= weekEnd) weekTokenUsd += d.costUsd;
    }
  }

  const fanUnreadCount =
    user?.id && profile ? await countFansSince(user.id, profile.lastFansSeenAt) : 0;

  return (
    <>
      <header className="app-header">
        <div className="app-header-titles">
          <div className="weekly-title-inline">
            <WeeklyAccountEntry
              email={user?.email ?? null}
              isAdmin={isAdminEmail(user?.email)}
              menuTrigger="avatar"
              fanUnreadCount={fanUnreadCount}
            />
            <h1>{user && profile ? profile.nickname : "我的复盘"}</h1>
          </div>
          <span className="sub">按自然周或按日浏览历史，查看复盘建议</span>
        </div>
      </header>

      <WeeklyReviewClient
        articles={articles}
        initialWeekStart={weekStart}
        initialDay={todayIso()}
        kpiExtras={{ historyDoneCount, totalTokenUsd, weekTokenUsd }}
      />
    </>
  );
}
