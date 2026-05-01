import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "随览页 · 预览",
  robots: { index: false, follow: false },
};

/** 与 public/browse-preview.html 同内容的 App 路由，避免 file:// 空格路径与中间件干扰 */
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
        .browse-preview-app header { margin-bottom: 12px; }
        .browse-preview-app h1 { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
        .browse-preview-app .sub { color: var(--muted); font-size: 0.8125rem; margin-top: 4px; display: block; }
        .browse-preview-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; align-items: center; }
        .browse-preview-tab { padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--card);
          color: var(--muted); font-size: 0.75rem; }
        .browse-preview-tab.active { border-color: var(--brand); color: var(--brand); background: var(--brand-soft); font-weight: 600; }
        .browse-preview-tab.add { border-style: dashed; }
        .browse-preview-kw { margin: 0 0 12px; font-size: 0.75rem; color: var(--muted); }
        .browse-preview-kw span { color: var(--ink); }
        .browse-preview-empty { margin: 0; font-size: 0.8125rem; color: var(--muted); line-height: 1.45; }
      `}</style>
      <div className="browse-preview-wrap">
        <p className="browse-preview-note">
          静态示意：关键词行无「长按标签……」提示。正式页面请打开 <strong>/browse</strong>。若需离线文件，请用浏览器打开项目内{" "}
          <code>public/browse-preview.html</code>（路径含空格时请对空格编码为 %20）。
        </p>
        <div className="browse-preview-phone">
          <div className="browse-preview-app">
            <header>
              <h1>随览</h1>
              <span className="sub">主题与关键词 · 每日联网浏览相关更新</span>
            </header>
            <div className="browse-preview-tabs">
              <span className="browse-preview-tab active">AI Evals</span>
              <span className="browse-preview-tab add">＋主题</span>
            </div>
            <p className="browse-preview-kw">
              关键词：<span>Hamel · Shreya · Stella&amp;Amy · Anthropic</span>
            </p>
            <p className="browse-preview-empty">
              暂无内容。请先滚回页面顶部，再下拉（触屏）或按住拖拽（鼠标）获取更新。
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
