---
name: restart-xhs-mcp
description: >-
  Restarts reading-plan Xiaohongshu MCP sidecar (port 18060), ngrok tunnel, and
  Playwright browser path for production Vercel /xhs-login. Use when the user asks
  to 重启小红书 MCP、ngrok 断了、随览小红书失败、xhs-login 获取二维码失败、
  Failed to fetch、ERR_NGROK_3200/8012、address already in use, or MCP 断开.
---

# 重启小红书 MCP（reading-plan）

随览抓小红书博主链接时，依赖 **本机 MCP（18060）**；线上 Vercel 还需 **ngrok 公网隧道**。两者窗口都必须保持打开。

项目根目录：

```text
/Users/wuwanlin/Cursor Projects/reading-plan-2026-05-01
```

## 一次性前置（已完成可跳过）

| 项 | 说明 |
|----|------|
| MCP 二进制 | `bash scripts/start-xhs-mcp-mac.sh` 首次会自动下载到 `tools/xhs-mcp/` |
| Playwright | `npx playwright install chromium` 后执行 `bash scripts/install-xhs-mcp-playwright-mac.sh`（MCP 需要 revision **1148** 路径） |
| ngrok | 下载至 `~/bin/ngrok`；`ngrok config add-authtoken <token>` |
| Vercel | `XHS_MCP_BASE_URL` = ngrok 的 `https://xxxx.ngrok-free.dev`（无末尾 `/`） |

## 标准重启流程（助手应逐步带用户执行）

### 1. 进入项目目录

```bash
cd "/Users/wuwanlin/Cursor Projects/reading-plan-2026-05-01"
```

### 2. 窗口 A — 启动 MCP（保持打开）

```bash
bash scripts/start-xhs-mcp-mac.sh
```

- 正常：日志停在 `启动 HTTP 服务器: arg1=:18060`，**不要关窗口**。
- `address already in use`：**表示已在跑**，不要重复启动；直接做步骤 3。
- `Couldn't connect` 且端口空闲：确认窗口 A 未退出；若 Playwright 报错见「故障对照」。

### 3. 窗口 B — 启动 ngrok（仅线上需要；保持打开）

```bash
~/bin/ngrok http 18060
```

或：

```bash
bash scripts/start-xhs-public-ngrok.sh
```

记录 **Forwarding** 行的 `https://xxxx.ngrok-free.dev`。免费版重启后 URL **可能变化**。

### 4. 自检（新终端，按顺序）

```bash
# 本机 MCP
curl http://127.0.0.1:18060/health

# 公网（线上必需）
curl -H "ngrok-skip-browser-warning: true" https://你的ngrok地址.ngrok-free.dev/health

# 登录接口（不应含 playwright / HTML 报错）
curl -H "ngrok-skip-browser-warning: true" https://你的ngrok地址.ngrok-free.dev/api/v1/login/status
```

期望：`health` 与 `login/status` 均为 **JSON**，含 `服务正常` 或 `is_logged_in`。

### 5. Vercel（仅 ngrok 地址变更时）

1. Settings → Environment Variables → `XHS_MCP_BASE_URL` 改为新 ngrok 地址
2. Deployments → **Redeploy**

### 6. 登录与验证

| 场景 | URL |
|------|-----|
| 线上 | `https://reading-plan-2026-05-01.vercel.app/xhs-login` → 刷新 → 小红书 App 扫码 |
| 本机 | `npm run dev` 后 `http://127.0.0.1:3000/xhs-login`（**无需 ngrok**） |
| 随览 | `/browse` 填入 xhslink 或博主主页后刷新 |

## 仅本机随览（最省事）

不需要 ngrok / Vercel 变量：

1. 窗口 A：`bash scripts/start-xhs-mcp-mac.sh`
2. 窗口 C：`npm run dev`
3. `http://127.0.0.1:3000/xhs-login` 与 `/browse`

## 故障对照

| 现象 | 原因 | 处理 |
|------|------|------|
| `curl 127.0.0.1:18060` 失败 | MCP 未跑或窗口已关 | 窗口 A 重新 `start-xhs-mcp-mac.sh` |
| `address already in use` | MCP 已在跑 | 跳过启动；`curl .../health` 验证 |
| ngrok HTML `ERR_NGROK_3200 offline` | ngrok 未跑 | 窗口 B 重新 `ngrok http 18060` |
| ngrok HTML `ERR_NGROK_8012 connection refused` | ngrok 在跑但 MCP 未跑 | 先启动 MCP |
| `/login/status` 500 + `playwright` / `1148` | 浏览器路径不对 | `bash scripts/install-xhs-mcp-playwright-mac.sh`，必要时重启 MCP |
| 线上 `Failed to fetch` / 获取二维码失败 | MCP/ngrok 断、或 Vercel 变量错、或函数超时 | 完成步骤 4；确认两窗口在线；核对 `XHS_MCP_BASE_URL` |
| ngrok 里 `/health` 200 但 `/login/*` 500 | Playwright | 见上 |
| `scripts/...` 找不到 | 不在项目目录 | 先 `cd` 到项目根 |

## 助手执行时注意

- **不要**在 `~` 主目录执行 `scripts/...`，必须 `cd` 到项目根。
- **不要**重复启动 MCP（端口占用即已在跑）。
- **不要**让用户在浏览器直接打开 `127.0.0.1:18060/api/v1/login/qrcode`（返回 JSON，不是网页）。
- Cursor 内置小红书 MCP（`.cursor/mcp.json` → `/mcp`）与网站 REST（`/api/v1/...`）共用同一 18060 服务，但 **不能替代 ngrok** 供 Vercel 调用。
- Mac 休眠或关闭任一窗口 → 线上随览立即失效。

## 相关脚本

| 脚本 | 用途 |
|------|------|
| `scripts/start-xhs-mcp-mac.sh` | 下载并启动 MCP :18060 |
| `scripts/start-xhs-public-ngrok.sh` | 检查 MCP 后启动 ngrok |
| `scripts/install-xhs-mcp-playwright-mac.sh` | 1148 浏览器路径兼容 |
