"use client";

/**
 * 根级错误 UI。Next 会把它当作客户端边界；显式提供可避免部分环境下
 * “global-error 未出现在 React Client Manifest” 的 Turbopack/RSC 问题。
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui", padding: 24, maxWidth: 480 }}>
        <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>出错了</h1>
        <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 14 }}>{error.message || "应用遇到错误，请重试。"}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
