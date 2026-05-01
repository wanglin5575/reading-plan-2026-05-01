import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "随览页 · 预览",
  robots: { index: false, follow: false },
};

/** 示例布局：右上角加号、主题 pill、文章卡片上的「待读 / 已读」（与 /browse 一致） */
export default function BrowsePreviewPage() {
  return (
    <>
      <style>{`
        .browse-preview-wrap { --bg: #f6f7fb; --card: #fff; --ink: #14202b; --muted: #5f6c7b; --border: #e3e8ef; --brand: #2e6cdf; --brand-soft: #e8efff;
          margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif;
          background: #d8dde8; padding: 24px 12px 32px; color: var(--ink); box-sizing: border-box; }
        .browse-preview-wrap * { box-sizing: border-box; }
        .browse-preview-note { font-size: 0.75rem; color: var(--muted); max-width: 420px; margin: 0 auto 16px; line-height: 1.5; }
        .browse-preview-phone { max-width: 414px; margin: 0 auto; background: var(--bg); border-radius: 20px; overflow: hidden;
          border: 1px solid var(--border); box-shadow: 0 12px 48px rgba(15, 23, 42, 0.12); }
        .browse-preview-app { padding: 16px 14px 120px; }
        .browse-preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .browse-preview-head .titles h1 { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
        .browse-preview-head .titles .sub { color: var(--muted); font-size: 0.8125rem; margin-top: 4px; display: block; line-height: 1.35; }
        .browse-preview-plus { width: 44px; height: 44px; border-radius: 50%; border: none; background: var(--brand); color: #fff;
          font-size: 1.35rem; line-height: 1; flex-shrink: 0; cursor: default; box-shadow: 0 1px 2px rgba(15,23,42,0.06), 0 4px 14px rgba(15,23,42,0.06); }
        .browse-preview-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; align-items: center; }
        .browse-preview-tab { padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--card);
          color: var(--muted); font-size: 0.75rem; }
        .browse-preview-tab.active { border-color: var(--brand); color: var(--brand); background: var(--brand-soft); font-weight: 600; }
        .browse-preview-kw { margin: 0 0 12px; font-size: 0.75rem; color: var(--muted); }
        .browse-preview-kw span { color: var(--ink); }
        .browse-preview-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 12px 14px; margin-bottom: 10px; }
        .browse-preview-card a.title { font-size: 1.0625rem; font-weight: 600; color: var(--brand); text-decoration: none; display: block; margin-bottom: 6px; }
        .browse-preview-card p.body { margin: 0; font-size: 0.8125rem; color: var(--muted); line-height: 1.45; }
        .browse-preview-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .browse-preview-actions button { font-size: 0.8125rem; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); cursor: default; }
        .browse-preview-actions button.primary { background: var(--brand); color: #fff; border-color: transparent; }
      `}</style>
      <div className="browse-preview-wrap">
        <p className="browse-preview-note">
          交互示例（静态）：轻点主题名切换列表；右上角「+」添加主题；每条可「加入待读 / 加入已读」（正式环境会抓取全文并写入数据库）。线上请打开{" "}
          <strong>/browse</strong>。
        </p>
        <div className="browse-preview-phone">
          <div className="browse-preview-app">
            <header className="browse-preview-head">
              <div className="titles">
                <h1>随览</h1>
                <span className="sub">主题与关键词 · 轻点主题切换列表 · 每日联网更新</span>
              </div>
              <button type="button" className="browse-preview-plus" aria-label="添加主题">
                +
              </button>
            </header>
            <div className="browse-preview-tabs">
              <span className="browse-preview-tab active">AI Evals</span>
              <span className="browse-preview-tab">工具链</span>
            </div>
            <p className="browse-preview-kw">
              关键词：<span>Hamel · Shreya · Stella&amp;Amy · Anthropic</span>
            </p>
            <div className="browse-preview-card">
              <a className="title" href="https://example.com/evals-2026" target="_blank" rel="noreferrer">
                示例：LLM Evals 最佳实践（示意）
              </a>
              <p className="body">
                摘要节选示意——正式页面由 Firecrawl 抓取摘要与正文节选；点击下方按钮会调用 /api/articles 将链接加入待读或一键已读。
              </p>
              <div className="browse-preview-actions">
                <button type="button">加入待读</button>
                <button type="button" className="primary">
                  加入已读
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
