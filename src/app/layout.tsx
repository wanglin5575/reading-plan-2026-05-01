import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Tabbar } from "@/components/Tabbar";

export const metadata: Metadata = {
  title: "阅读计划",
  description: "贴入文章链接，自动分类、估算阅读时长，每日推荐与每周回顾",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2e6cdf",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app">{children}</div>
        <Tabbar />
      </body>
    </html>
  );
}
