import Link from "next/link";

/** 显式 404 页：避免 Dev（Turbopack）仅依赖内置 not-found 时在部分环境下缺少 build 产物导致 ENOENT */
export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 32 }}>
      <p style={{ margin: "0 0 8px", fontSize: "var(--fs-sub)", fontWeight: 600 }}>页面不存在</p>
      <p className="muted-link" style={{ margin: "0 0 16px" }}>
        请检查链接，或返回首页。
      </p>
      <Link href="/" className="btn secondary">
        回待读
      </Link>
    </div>
  );
}
