import { AddArticleForm } from "@/components/AddArticleForm";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  return (
    <>
      <header className="app-header">
        <h1>添加</h1>
        <span className="sub">粘贴链接后自动抓取、识别主题并生成中文大意</span>
      </header>

      <AddArticleForm />
    </>
  );
}
