import { listArticlesForUser } from "@/lib/db";
import { ReadPageClient } from "@/components/ReadPageClient";
import { getServerAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ReadPage() {
  const user = await getServerAuthUser();
  const all = await listArticlesForUser(user?.id ?? null);
  const done = all.filter((a) => a.status === "done").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  return <ReadPageClient items={done} />;
}
