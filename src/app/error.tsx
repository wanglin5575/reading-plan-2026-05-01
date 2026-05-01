"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty" style={{ marginTop: 24 }}>
      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>页面加载出错</p>
      <p className="muted-link" style={{ margin: "0 0 16px", fontSize: "var(--fs-small)", wordBreak: "break-word" }}>
        {error.message || "未知错误"}
      </p>
      <button type="button" className="btn secondary" onClick={() => reset()}>
        重试
      </button>
    </div>
  );
}
