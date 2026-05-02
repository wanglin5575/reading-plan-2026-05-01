# 随览「原文发布时间」采集与治理方案

## 现状（代码在 `src/lib/browse-published.ts` + `browse-search.ts`）

- 主搜带 `markdown` + `rawHtml`，`onlyMainContent: false`，便于从整页 HTML / 片段里扫 `article:published_time`、`og:published_time`、`time[datetime]`、JSON-LD `datePublished`。
- Firecrawl `metadata` 全表递归 + 字段名加权；并与 **news 竖条里的日期**、**SERP 摘要里抠出来的日期**合并，按分数取最高一条。
- `normalizePublishedToIso` 会丢弃无法解析、`now/unknown`、相对时间文案、年份异常，以及 **比「现在」晚超过约 36 小时** 的时间戳（减少误取「定时发布」或错误字段导致的离谱未来时间）。

## 常见问题原因

1. **页内根本没有可靠日期**：多为聚合页、付费墙、重定向落地页、纯 JS 壳站；此时只有 SERP 摘要或新闻块日期，或完全缺失。
2. **取到的是 `modified` / `updated` / 缓存时间**：已通过 meta key 降权，但在单一来源时仍可能被当成「唯一候选」。
3. **JSON-LD 多实体 / `@graph`**：已遍历 `@graph` 与 `datePublished`，若页面多套 schema 混杂，仍可能抽到非正文对象的日期。
4. **SERP 摘要日期是「站内列表日期」或摘录错误**：权重较低（35），但若其他来源全无，仍会显示——可能不靠谱。

## 改进方向（可按优先级迭代）

### A. 置信度与展示（产品层）

- 为每条 hit 存 `publishedTimeSource`（如 `meta` | `jsonld` | `html_meta` | `news` | `serp`）与可选 `publishedTimeConfidence: high|low`。
- UI：低置信或仅 SERP 时显示「约 · 日期」或灰色提示，避免与高精度日期同等展示。
- 排序：默认仍按时间倒序，但可选项「优先可靠日期」时把无日期 / 仅 SERp 排后。

### B. 多候选仲裁（算法层）

- 同一 URL 若 `meta` 与 `news` 相差 **>7 天**，降权较低分来源或 discard 两者取「中间」策略（需记录双日期用于调试）。
- 对 **`article:modified_time` 与 `article:published_time` 同时存在** 时强制优先 published（当前已通过 score 体现，可再加硬规则）。

### C. 增量刷新与二次抓取（工程层）

- 对 `publishedTime == null` 的 URL 做 **lazy 二次单页 scrape**（独立队列、限流），专抓 `rawHtml` + 更长超时；成功则回写 feed item。
- 将「随览转待读」时的全页抓取结果里的发布时间 **merge** 回 browse 存储（若用户从随览入库，可用更强的一手数据覆盖）。

### D. 用户纠错（最后手段）

- 已加入待读的文章依赖主列表的元数据编辑；随览也可在卡片上提供「校正发布时间」（写入 `BrowseStoredHit`），仅影响展示与排序。

## 已落实的代码层小步

- `normalizePublishedToIso`：过滤「明显未来」时间戳（约 36h 容忍），减轻离谱日期。
- 后续可接上文的 `publishedTimeSource` 字段，便于日志与 UI 区分「未提供」与「低置信」。
