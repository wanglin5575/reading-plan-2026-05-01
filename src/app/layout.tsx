import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Tabbar } from "@/components/Tabbar";
import { AuthGateOverlay } from "@/components/AuthGateOverlay";
import { isAuthEnabled } from "@/lib/auth";
import { getServerAuthUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "阅读计划",
  description: "贴入文章链接，自动分类、估算阅读时长，每日推荐与复盘",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2e6cdf",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
