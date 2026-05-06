"use client";

import { useLayoutEffect } from "react";

const AUTHS_PATH = "/preview/go/authed?path=%2Fweekly";

/**
 * 书签入口：必须用**整页导航**进入 /preview/go/authed（写演示 Cookie → /weekly）。
 * 根 middleware 对该路径返回 307 时，Next 客户端路由的 RSC 请求无法正确处理，地址会卡在 /weekly-authed-preview。
 */
export default function WeeklyAuthedPreviewPage() {
  const isProd = process.env.NODE_ENV === "production";

  useLayoutEffect(() => {
    if (isProd) return;
    window.location.replace(`${window.location.origin}${AUTHS_PATH}`);
  }, [isProd]);

  if (isProd) {
    return (
      <div className="card" style={{ margin: "1rem" }}>
        <p>
          <strong>演示登录仅开发环境可用</strong>。请在本机运行 <code>npm run dev</code> 后再打开本地址，或正常登录后访问{" "}
          <a href="/weekly">/weekly</a>。
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ margin: "1rem" }}>
      <p>正在进入「我的复盘」演示登录…</p>
      <p className="muted-link" style={{ marginTop: 10 }}>
        若未自动跳转，请
        <a href={AUTHS_PATH}>点此继续</a>（须整页打开，勿用客户端路由预取）。
      </p>
    </div>
  );
}
