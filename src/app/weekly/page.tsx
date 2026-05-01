import { listArticlesForUser } from "@/lib/db";
import { startOfWeekIso, todayIso } from "@/lib/plan";
import { getServerAuthUser } from "@/lib/auth/server";
import WeeklyReviewClient from "@/components/WeeklyReviewClient";
import { AccountAvatarMenu } from "@/components/AccountAvatarMenu";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const user = await getServerAuthUser();
  const articles = await listArticlesForUser(user?.id ?? null);

  return (
    <>
      <header className="app-header app-header-with-actions">
        <div className="app-header-titles">
          <h1>复盘</h1>
          <span className="sub">按自然周或按日浏览历史，查看复盘建议</span>
        </div>
        {user?.email ? <AccountAvatarMenu email={user.email} /> : null}
      </header>

      <WeeklyReviewClient articles={articles} initialWeekStart={startOfWeekIso()} initialDay={todayIso()} />
    </>
  );
}
