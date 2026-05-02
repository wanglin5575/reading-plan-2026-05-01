import type { BrowseStoredHit } from "./browse-storage";

/** 与随览示例卡片绑定；勿用于真实抓取或入库 */
export const BROWSE_UI_DEMO_URL = "https://example.com/reading-plan-browse-ui-preview";

export function isBrowseUiDemoHit(hit: Pick<BrowseStoredHit, "url">): boolean {
  return hit.url === BROWSE_UI_DEMO_URL;
}

/** 仅供 NODE_ENV=development 时插入列表首位；生产构建不会打包进用户可见逻辑（由调用方判断环境） */
export function createBrowseUiDemoHit(topicLabel: string): BrowseStoredHit {
  const now = new Date().toISOString();
  const topic = topicLabel.trim() || "当前主题";
  return {
    url: BROWSE_UI_DEMO_URL,
    title: "随览界面示例（仅本地开发可见）",
    description:
      "生产环境部署后不会出现本条。可练习左滑露出「已读 / 待读」；标题不跳转外链。刷新主题后真实结果接在下方。",
    summary: `（主题「${topic}」下的列表样式预览。）灰色小字为摘要区示例。此卡不能加入待读或已读。`,
    excerpt: "左缘向右滑，露出两枚圆形按钮；松手后卡片复位。",
    publishedTime: now,
    author: "示例作者",
    estimatedMinutes: 6,
    firstSeenAt: now,
    lastRefreshedAt: now,
  };
}
