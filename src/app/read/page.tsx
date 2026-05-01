import { listArticles } from "@/lib/db";
import { ReadPageClient } from "@/components/ReadPageClient";

export const dynamic = "force-dynamic";

export default async function ReadPage() {
  const all = await listArticles();
  const done = all.filter((a) => a.status === "done").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  return <ReadPageClient items={done} />;
}
