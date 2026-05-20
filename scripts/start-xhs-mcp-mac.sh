#!/bin/bash
# Mac 上一键下载并启动小红书 MCP（不用 Docker 时的备选）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/tools/xhs-mcp"
mkdir -p "$DIR/data" "$DIR/images"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ASSET="xiaohongshu-mcp-darwin-arm64.tar.gz" ;;
  x86_64) ASSET="xiaohongshu-mcp-darwin-amd64.tar.gz" ;;
  *)
    echo "不支持的 Mac 架构: $ARCH"
    exit 1
    ;;
esac

VER="v2026.03.03.1940-cookie-fix"
URL="https://github.com/vmxmy/xiaohongshu-mcp/releases/download/${VER}/${ASSET}"
BIN="$DIR/xiaohongshu-mcp"

if [ ! -x "$BIN" ]; then
  echo "正在下载 ${ASSET} …"
  curl -L "$URL" -o "/tmp/${ASSET}"
  tar -xzf "/tmp/${ASSET}" -C "$DIR"
  chmod +x "$BIN" 2>/dev/null || true
  if [ ! -x "$BIN" ]; then
    # 压缩包内可能带版本后缀文件名
    FOUND="$(find "$DIR" -maxdepth 1 -type f -name 'xiaohongshu-mcp*' ! -name '*.tar.gz' | head -1)"
    [ -n "$FOUND" ] && mv "$FOUND" "$BIN" && chmod +x "$BIN"
  fi
fi

if [ ! -x "$BIN" ]; then
  echo "未找到可执行文件，请手动从 GitHub Releases 下载："
  echo "https://github.com/vmxmy/xiaohongshu-mcp/releases"
  exit 1
fi

export COOKIES_PATH="$DIR/data/cookies.json"
echo "启动小红书 MCP：http://127.0.0.1:18060"
echo "（本窗口请保持打开；Ctrl+C 可停止）"
exec "$BIN" --port=":18060"
