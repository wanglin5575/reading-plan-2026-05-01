#!/bin/bash
# 小红书 MCP 依赖 Playwright 浏览器 revision 1148；新版 npx playwright install 装的是 1223，需做路径兼容。
set -e
CACHE="$HOME/Library/Caches/ms-playwright"
SRC="$CACHE/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64"
DST="$CACHE/chromium_headless_shell-1148/chrome-mac"

if [ ! -d "$SRC" ]; then
  echo "未找到 chromium_headless_shell-1223，先执行："
  echo "  npx playwright install chromium"
  exit 1
fi

echo "配置 Playwright 1148 兼容路径 …"
rm -rf "$CACHE/chromium_headless_shell-1148"
mkdir -p "$CACHE/chromium_headless_shell-1148"
cp -R "$SRC" "$DST"
ln -sf chrome-headless-shell "$DST/headless_shell"
echo "完成。请重启 MCP：bash scripts/start-xhs-mcp-mac.sh"
