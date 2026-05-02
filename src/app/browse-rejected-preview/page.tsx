import type { Metadata } from "next";
import { Fragment } from "react";

export const metadata: Metadata = {
  title: "随览 · 筛除记录样式预览",
  robots: { index: false, follow: false },
};

/**
 * 静态预览：未读粉点 + 按日分组的筛除列表（与 /browse 使用相同 class，仅示例数据）。
 * 本地开发打开：http://localhost:3000/browse-rejected-preview
 */
export default function BrowseRejectedPreviewPage() {
  const groups = [
    {
      dayLabel: "2026-05-01",
      items: [
        {
          url: "https://youtube.com/watch?v=demo-a",
          title: "示例：模型评测流水线与设计思路（示意标题略长用于换行测试）",
          meta: "YouTube · 作者：Alice",
          reason: "聚合目录页，信息密度低",
        },
        {
          url: "https://linkedin.com/posts/demo-b",
          title: "另一篇被筛掉的分享",
          meta: "LinkedIn · 作者：Bob",
          reason: "主要为招聘与活动宣传",
        },
      ],
    },
    {
      dayLabel: "2026-04-28",
      items: [
        {
          url: "https://example.com/docs/nav-only",
          title: "导航型文档首页",
          meta: "网页",
          reason: "导航、聚合页",
        },
      ],
    },
    {
      dayLabel: "早期",
      items: [
        {
          url: "https://medium.com/@x/old",
          title: "无更新时间的旧记录（展示为「早期」分组）",
          meta: "Medium",
          reason: "与主题弱相关",
        },
      ],
    },
  ];

  return (
    <div className="browse-rejected-preview" style={{ padding: "20px 14px 32px", maxWidth: 480, margin: "0 auto" }}>
      <h1 className="page-title" style={{ fontSize: "1.1rem", margin: "0 0 6px" }}>
        筛除记录 · 样式预览
      </h1>
      <p className="muted-link" style={{ margin: "0 0 20px", fontSize: "var(--fs-small)", lineHeight: 1.45 }}>
        与正式页相同 CSS。粉点无描边；下方为模拟弹窗内多日刷新记录。正式环境请用{" "}
        <strong>/browse</strong> 下拉刷新产生真实数据。
      </p>

      <h2 className="muted-link" style={{ fontSize: "var(--fs-micro)", margin: "0 0 8px", fontWeight: 600 }}>
        1）工具栏：筛除记 + 录（未读粉点） + 排序
      </h2>
      <div className="browse-kw-row" style={{ marginBottom: 24 }}>
        <div className="muted-link browse-kw-line browse-kw-main">
          <span className="browse-kw-fixed-label">关键词：</span>
          <button type="button" className="browse-kw-chips-btn" tabIndex={-1}>
            <span className="browse-kw-chips">Hamel · Shreya · Stella · Amy ···</span>
          </button>
        </div>
        <div className="browse-kw-actions">
          <button type="button" className="browse-ai-rejected-btn" aria-label="筛除记录（有新筛除条目）">
            <span className="browse-ai-rejected-btn-text">
              筛除记
              <span className="browse-ai-rejected-record-wrap">
                录
                <span className="browse-ai-rejected-unread-dot" aria-hidden />
              </span>
            </span>
          </button>
          <div className="browse-sort-dd">
            <button type="button" className="browse-sort-dd-trigger" aria-label="排序方式（示意）">
              <span className="browse-sort-dd-label">按发布时间</span>
              <span className="browse-sort-dd-chevron" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <h2 className="muted-link" style={{ fontSize: "var(--fs-micro)", margin: "0 0 8px", fontWeight: 600 }}>
        2）弹窗内：按更新时间分段
      </h2>
      <div className="modal-sheet browse-ai-rejected-sheet" style={{ maxWidth: "100%" }}>
        <div className="modal-sheet-header">
          <h2 id="browse-rejected-preview-title">AI 筛除条目</h2>
          <button type="button" className="modal-sheet-close" tabIndex={-1} aria-label="关闭（预览示意）">
            ×
          </button>
        </div>
        <div style={{ padding: "0 14px" }}>
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
            当前主题下被判定为不值得阅读。点击标题打开原文（无文章大意）。
          </p>
          <ul className="browse-ai-rejected-list" style={{ maxHeight: "none" }}>
            {groups.map((g, gi) => (
              <Fragment key={`${g.dayLabel}-${gi}`}>
                <li className="browse-ai-rejected-day-split">
                  <span className="browse-ai-rejected-day-label">{g.dayLabel}</span>
                </li>
                {g.items.map((x) => (
                  <li key={x.url}>
                    <a href={x.url} className="browse-ai-rejected-link" tabIndex={-1} onClick={(e) => e.preventDefault()}>
                      {x.title}
                    </a>
                    <p className="browse-ai-rejected-meta">{x.meta}</p>
                    <p className="browse-ai-rejected-reason">{x.reason}</p>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        </div>
        <div className="modal-sheet-footer">
          <button type="button" className="btn secondary" tabIndex={-1}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
