---
name: publish-to-vercel
description: >-
  Publishes the reading-plan Next.js app by committing changes and pushing
  origin/main so the linked Vercel project runs a production deployment.
  Use when the user asks to 发布、部署、上线、release、deploy to Vercel, or ship
  changes for this repository.
---

# 发布到 Vercel（reading-plan）

本仓库的生产发布依赖 **GitHub → Vercel** 自动部署：把 `main` 推送到 GitHub 后，Vercel 会拉取代码并构建。

## 前置条件（一次性）

- GitHub 远程：`origin` 指向本仓库（例如 `wanglin5575/reading-plan-2026-05-01`）。
- Vercel 已导入该 GitHub 仓库，且 **Production Branch** 为 `main`。
- Vercel 项目里已配置与本地一致的环境变量（如 `DATABASE_URL`、`AI_*`、`FIRECRAWL_*`、Auth 相关等）。

## 标准发布流程（助手应代为执行）

1. **确认工作目录**为项目根：`reading-plan-2026-05-01`（或当前 monorepo 下的该子目录）。
2. **`git status`**：查看变更；如有未跟踪文件一并纳入。
3. **可选**：`npm run build` 确认能通过（用户赶时间时可跳过，但 CI/ Vercel 失败时要能排查）。
4. **`git add`** 相关文件 → **`git commit -m "…"`**：说明性英文或中文提交信息（类型前缀如 `feat:` / `fix:` 与仓库习惯一致）。
5. **`git push origin main`**（需要 network + git 权限）。
6. **告知用户**：推送已完成；请到 [Vercel Dashboard](https://vercel.com) → 对应项目 → **Deployments** 查看构建与 Production URL。若失败，根据构建日志排查（依赖、环境变量、`next build` 错误等）。

## 不要做

- 不要假定用户已安装并登录 Vercel CLI；默认以 **git push 触发** 为准。
- 不要把已删除路径当作终端 `cwd`。
- 若无 Git 写入权限或未配置 `origin`，先说明阻塞原因，不要假称已推送。

## 与本项目相关的备注

- 数据库表由应用在首次连接 Postgres 时 **`ensureSchema()`** 创建；新环境需在 Vercel 配置 **`DATABASE_URL`**。
- 若用户曾用 CLI 部署，可作为兜底提及：`vercel --prod`（需在项目目录且已 `vercel login`），但以 **推送 main** 为主流程。
