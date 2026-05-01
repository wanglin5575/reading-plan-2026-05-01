import BrowsePageClient from "@/components/BrowsePageClient";

export const dynamic = "force-dynamic";

export default function BrowsePage() {
  return (
    <>
      <header className="app-header">
        <h1>随览</h1>
        <span className="sub">主题与关键词 · 每日联网浏览相关更新</span>
      </header>
      <BrowsePageClient />
    </>
  );
}
