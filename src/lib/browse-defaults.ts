/** 随览：列表默认隐藏「原文发布时间」早于今天往前 N 天的条目（无发布时间的条目仍保留） */
export const BROWSE_DEFAULT_MAX_PUBLISHED_AGE_DAYS = 90;

/** 预置主题「AI Evals」随览 B 渠道种子（可编辑）：站点/RSS，用于 RSS 拉取 + 检索 site: 限定 */
export const DEFAULT_AI_EVALS_SEED_SOURCES: string[] = [
  "https://repo.maven.apache.org/maven2/",
  "https://www.youtube.com/",
  "https://www.linkedin.com/",
  "https://twitter.com/",
  "https://hamel.dev/blog/",
];
