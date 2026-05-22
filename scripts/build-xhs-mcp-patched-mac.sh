#!/bin/bash
# 从源码构建「博主主页 DOM 稳定」修复版 xiaohongshu-mcp（Mac arm64/amd64）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/tools/xhs-mcp"
PATCH="$ROOT/scripts/patches/xhs-mcp-user-profile-dom.patch"
BUILD_DIR="$OUT_DIR/src-build"
VER="v2026.03.03.1940-cookie-fix"
BIN="$OUT_DIR/xiaohongshu-mcp-patched"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) GOARCH=arm64 ;;
  x86_64) GOARCH=amd64 ;;
  *)
    echo "不支持的 Mac 架构: $ARCH"
    exit 1
    ;;
esac

ensure_go() {
  if command -v go >/dev/null 2>&1; then
    return 0
  fi
  local GO_ROOT="$OUT_DIR/.go-toolchain"
  local GO_BIN="$GO_ROOT/go/bin/go"
  if [ -x "$GO_BIN" ]; then
    export PATH="$GO_ROOT/go/bin:$PATH"
    return 0
  fi
  local GO_TGZ="go1.24.2.darwin-${GOARCH}.tar.gz"
  local GO_URL="https://go.dev/dl/${GO_TGZ}"
  echo "未检测到 Go，正在下载便携工具链到 $GO_ROOT …"
  mkdir -p "$GO_ROOT"
  curl -L "$GO_URL" -o "/tmp/${GO_TGZ}"
  tar -C "$GO_ROOT" -xzf "/tmp/${GO_TGZ}"
  export PATH="$GO_ROOT/go/bin:$PATH"
}

echo "==> 准备 Go 工具链"
ensure_go
go version

echo "==> 拉取 xiaohongshu-mcp ${VER}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
SRC_TGZ="/tmp/xhs-mcp-src-${VER}.tar.gz"
curl -L "https://github.com/vmxmy/xiaohongshu-mcp/archive/refs/tags/${VER}.tar.gz" -o "$SRC_TGZ"
tar -xzf "$SRC_TGZ" -C "$BUILD_DIR" --strip-components=1

echo "==> 应用博主主页 DOM 修复补丁"
cd "$BUILD_DIR"
patch -p1 < "$PATCH"

echo "==> 编译 patched 二进制"
export CGO_ENABLED=0
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"
go build -trimpath -ldflags="-s -w" -o "$BIN" .

chmod +x "$BIN"
echo ""
echo "已生成: $BIN"
echo "请重启 MCP：bash scripts/start-xhs-mcp-mac.sh（将优先使用 patched 版本）"
