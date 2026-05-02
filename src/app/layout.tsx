import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { Tabbar } from "@/components/Tabbar";
import { AuthGateOverlay } from "@/components/AuthGateOverlay";
import { isAuthEnabled } from "@/lib/auth";
import { getServerAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "阅读计划",
  description: "贴入文章链接，自动分类、估算阅读时长，每日推荐与复盘",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2e6cdf",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /** 避免根布局在构建阶段被静态化，导致线上 NEXT_PUBLIC / Cookie 与本地不一致、登录蒙层不出现 */
  await connection();

  const authEnabled = isAuthEnabled();
  const user = authEnabled ? await getServerAuthUser() : null;
  const initialSignedIn = Boolean(user);

  return (
    <html lang="zh-CN">
      <body>
        <div className="app">{children}</div>
        <Tabbar />
        <AuthGateOverlay authEnabled={authEnabled} initialSignedIn={initialSignedIn} />
      </body>
    </html>
  );
}
