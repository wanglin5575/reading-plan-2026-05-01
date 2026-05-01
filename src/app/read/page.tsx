import { listArticles } from "@/lib/db";
import { ReadGroupedList } from "@/components/ReadGroupedList";

export const dynamic = "force-dynamic";

export default async function ReadPage() {
  const all = await listArticles();
  const done = all.filter((a) => a.status === "done").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  return (
    <>
      <header className="app-header">
        <h1>已读</h1>
        <span className="sub">共 {done.length} 篇</span>
      </header>
      <ReadGroupedList items={done} />
    </>
  );
}
