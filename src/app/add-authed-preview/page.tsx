"use client";

import { useLayoutEffect } from "react";

const AUTHS_PATH = "/preview/go/authed?path=%2Fadd";

/** 书签：演示已登录态直接进入「添加」页 */
export default function AddAuthedPreviewPage() {
  const isProd = process.env.NODE_ENV === "production";

  useLayoutEffect(() => {
    if (isProd) return;
    window.location.replace(`${window.location.origin}${AUTHS_PATH}`);
  }, [isProd]);

  if (isProd) {
    return (
      <div className="card" style={{ margin: "1rem" }}>
        <p>
          <strong>演示登录仅开发环境可用</strong>。请 <code>npm run dev</code> 后再试，或查看{" "}
          <a href="/demo-authed-site-preview">/demo-authed-site-preview</a>。
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ margin: "1rem" }}>
      <p>正在进入「添加」页（演示已登录）…</p>
      <p className="muted-link" style={{ marginTop: 10 }}>
        若未跳转，请
        <a href={AUTHS_PATH}>点此继续</a>。
      </p>
    </div>
  );
}
