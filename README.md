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
cp .env.example .env.local        # 填入 DATABASE_URL 时用库内数据；不设库时 `next dev` 会自动带 1 待读+1 已读示例仅用于看样式
npm run dev                       # 默认使用 Webpack dev（更稳）；若要 Turbopack 可用 npm run dev:turbo
```

打开 http://localhost:3000 即可。（若遇 **`EMFILE: too many open files`**，先在终端执行 **`ulimit -n 10240`** 再 `npm run dev`。）

### 故障排除

- 若出现 **React Client Manifest / global-error** 相关报错：已包含 `src/app/global-error.tsx`；本机可先 **停掉 dev**，删除缓存目录 `.next` 后再执行 `npm run dev`。若仍异常，可试 **`npm run dev:turbo`**（Turbopack，更快但偶发缓存问题）。
- 若页面仅显示 **Internal Server Error**：先删除 `.next` 后重新 `npm run build && npm run start`（或 `npm run dev`）。若曾启用 `output: "standalone"` 却用 `next start`，易与 Next 16 不兼容；当前配置已去掉 standalone，本地请用常规 `next start`。
- 浏览器 **连不上 localhost:3000**（如 Safari **错误 -102**）：多半是 dev 没在跑，或旧进程已退出但留下 **`.next/dev/lock`**，新终端里 `npm run dev` 会误报「已有服务」。删掉 **`reading-plan-…/.next/dev/lock`** 后再执行 **`npm run dev`**。若终端出现 **`EMFILE: too many open files`**，在本机提高句柄上限后再开 dev（例如 `ulimit -n 10240`）。
- 访问 **/** 却出现 **404 This page could not be found**：Dev 下的路由缓存可能坏了（例如 **`.next/dev/server/app-paths-manifest.json`** 里几乎没有路由）。在项目根执行 **`rm -rf .next`** 后重新 **`npm run dev`**（会先慢一轮编译，属正常）。也可直接：**`npm run dev:clean`**。
- 若终端报 **`ENOENT`** 且指向 **`build-manifest.json`** 或 Turbopack **`Compaction failed`**：先 **`rm -rf .next`**，执行 **`ulimit -n 10240`**，再 **`npm run dev`**（当前默认已是 **Webpack**，一般可避开 Turbopack 缓存损坏）。仍要 Turbopack 时用 **`npm run dev:turbo`**。
- 浏览器只显示 **Internal Server Error**：看运行 **`npm run dev` 的终端**里红色堆栈（常见：数据库连不上、`.next` 损坏）。可先 **`rm -rf .next`** 再 **`npm run dev`**；页面级错误会尽量由 **`error.tsx`** 显示具体原因并可点「重试」。

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

## 账号（Supabase Auth）

1. 在 [Supabase](https://supabase.com) 创建项目，**Authentication → Providers** 中保持 **Email** 开启（本地测试可在 **Auth** 设置里关闭「Confirm email」以免收信）。
2. 在 **Project Settings → API** 复制 **Project URL**、**anon public** key，写入环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. 仍使用同一项目的 **Database** 连接串作为 `DATABASE_URL`。首次部署后表 `articles` 会增加 `user_id` 列；**新写入的文章归属当前登录用户**；未登录时无法读写需登录的数据接口。
4. 若仅配置了数据库、**未**配置上述两项，应用行为与旧版一致（不按用户隔离）。

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
- **我的**：邮箱注册与登录（可选启用 Supabase Auth），阅读数据按账号隔离。
- **每周回顾**：按自然周或单日查看已读与复盘建议。
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
   - `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（启用邮箱注册 / 登录与按用户隔离数据时必填）
   - `FIRECRAWL_API_KEY`（可选）
4. 重新部署后即可公网访问，数据持久化在 Supabase。
