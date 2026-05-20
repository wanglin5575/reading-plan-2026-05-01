#!/bin/bash
# 把本机小红书 MCP (18060) 暴露到公网，供 Vercel 线上站点调用。
# 用法：bash scripts/start-xhs-public-ngrok.sh
# 前置：brew install ngrok && ngrok config add-authtoken <你的token>
set -e

HEALTH_URL="http://127.0.0.1:18060/health"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "未安装 ngrok。请先执行："
  echo "  brew install ngrok"
  echo "然后在 https://dashboard.ngrok.com/get-started/your-authtoken 复制 token，执行："
  echo "  ngrok config add-authtoken <你的token>"
  exit 1
fi

if ! curl -sf --connect-timeout 3 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "本机 MCP 未启动。请先另开终端执行："
  echo '  cd "/Users/wuwanlin/Cursor Projects/reading-plan-2026-05-01"'
  echo "  bash scripts/start-xhs-mcp-mac.sh"
  exit 1
fi

echo "本机 MCP 正常。"
echo ""
echo "即将启动 ngrok 公网隧道（本窗口请保持打开）。"
echo "启动后复制 Forwarding 行的 https://....ngrok-free.app 地址，"
echo "填到 Vercel → Settings → Environment Variables → XHS_MCP_BASE_URL"
echo "然后 Deployments → Redeploy，再打开线上 /xhs-login 扫码。"
echo ""
exec ngrok http 18060
