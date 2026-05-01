import { listArticles } from "@/lib/db";
import { ArticleCard } from "@/components/ArticleCard";
import { AllFilters } from "./AllFilters";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SearchParams {
  theme?: string;
  status?: string;
  q?: string;
}

export default async function AllPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const articles = await listArticles();
  const themes = Array.from(new Set(articles.map((a) => a.theme))).sort();

  const filtered = articles.filter((a) => {
    if (params.theme && params.theme !== "all" && a.theme !== params.theme) return false;
    if (params.status === "todo" && a.status !== "todo") return false;
    if (params.status === "done" && a.status !== "done") return false;
    if (params.q) {
      const q = params.q.toLowerCase();
      if (!`${a.title} ${a.url} ${a.summary}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const groups = groupByDueDate(filtered);

  return (
    <>
      <header className="app-header">
        <h1>全部文章</h1>
        <span className="sub">共 {articles.length} 篇 · 当前筛选 {filtered.length} 篇</span>
      </header>

      <AllFilters themes={themes} initial={params} />

      {groups.length === 0 ? (
        <div className="empty">没有符合筛选条件的文章。</div>
      ) : (
        groups.map(({ key, label, items }) => (
          <div key={key}>
            <h3 className="section-title">{label} · {items.length} 篇</h3>
            {items.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        ))
      )}
    </>
  );
}

function groupByDueDate(items: Article[]) {
  const map = new Map<string, Article[]>();
  for (const a of items) {
    const key = a.status === "done" ? "done" : a.dueDate;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  const arr = Array.from(map.entries()).map(([key, list]) => ({
    key,
    label: key === "done" ? "已读" : `截止 ${key}`,
    items: list,
  }));
  arr.sort((a, b) => {
    if (a.key === "done") return 1;
    if (b.key === "done") return -1;
    return a.key.localeCompare(b.key);
  });
  return arr;
}
