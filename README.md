# 阅读计划 (Reading Plan)

一个移动端友好的阅读管理网站。把你看到的好文章链接贴进去，自动抓取正文、识别主题、估算阅读时长，告诉你今天该读什么、哪些重点精读、哪些快速扫览，并按周对比进步。

## 技术栈

- Next.js 16（App Router）
- TypeScript + React 19
- Supabase Postgres（`pg`）
- Firecrawl 网页正文抓取（可选，强烈推荐）
- 纯规则法分类与阅读时长估算（无需 AI key）

## 快速开始

```bash
cd "/Users/wuwanlin/Cursor Projects/reading-plan-2026-05-01"
cp .env.example .env.local        # 编辑后填入 DATABASE_URL；本地体验示例数据可设 SEED_DEMO_ARTICLES=1
npm run dev
```

打开 http://localhost:3000 即可。

## 移动端访问（同一 WiFi）

dev server 已绑定 `0.0.0.0`，所以同 WiFi 下手机可以直接打开。

1. 在 Mac 终端运行：
   ```bash
   ipconfig getifaddr en0
   ```
   拿到 IP，比如 `192.168.1.20`。
2. iPhone 浏览器访问 `http://192.168.1.20:3000` 即可。
3. Safari 里点击「分享 → 添加到主屏幕」，可以像 App 一样使用。

## Firecrawl 密钥（可选但推荐）

- 没有密钥也能跑：会自动降级用 Node fetch + 简易 HTML 正文提取，对静态网页够用，对 SPA / 反爬严重的网站会差。
- 有密钥时：自动使用 Firecrawl 抓取 markdown，质量好得多。
- 申请：https://firecrawl.dev/  → 拿到 `fc-xxx` key 后写入 `.env.local` 的 `FIRECRAWL_API_KEY`。

## 数据库配置（Supabase）

1. 在 Supabase 创建项目。
2. 进入 `Project Settings -> Database`，复制连接串（建议 pooler 连接）。
3. 写入 `.env.local` 的 `DATABASE_URL`。
4. 首次请求会自动建表（`articles`）。

## 主要功能

- **今日推荐**：按截止日期 + 重要度排序，给出预估总时长。
- **重点 / 扫览**：长文 + 主修方向 → 重点精读；短文 → 快速扫览。
- **主题分类**：内置 AI / 产品 / 工程 / 数据 / 商业 / 设计 / 管理等规则。
- **阅读时长估算**：按中文 350 字/分、英文 220 词/分。
- **每周回顾**：本周读了多少、覆盖哪些主题、关键词、与上周对比、新接触的主题。
- **PWA-friendly**：移动端深色模式自动适配，可加入主屏幕。

## 后续可扩展（v3 备选）

- 接入 OpenAI / Claude，把规则法升级为真正的 AI 摘要 + 分类 + 个性化推荐
- iOS Shortcut：在 Safari 用「分享 → 阅读计划」一键添加链接
- 多用户/账号系统
- 复习模式（根据遗忘曲线提醒重读）

## 目录结构

```
reading-plan-2026-05-01/
├── src/
│   ├── app/                # Next.js 页面与 API 路由
│   │   ├── page.tsx        # 今日
│   │   ├── all/            # 全部文章
│   │   ├── weekly/         # 每周回顾
│   │   └── api/articles/   # CRUD / 刷新
│   ├── components/         # AddArticleForm, ArticleCard, Tabbar
│   └── lib/                # db.ts / scrape.ts / classify.ts / plan.ts
├── legacy/                 # v1 静态版本（保留参考）
├── package.json
├── next.config.mjs
├── tsconfig.json
└── .env.example
```

## 部署到 Vercel（结构已就绪）

1. 把项目 push 到 GitHub。
2. 在 Vercel 导入仓库，选 Next.js 框架。
3. 在 Vercel Dashboard → Settings → Environment Variables 配置：
   - `DATABASE_URL`（Supabase Postgres）
   - `FIRECRAWL_API_KEY`（可选）
4. 重新部署后即可公网访问，数据持久化在 Supabase。
