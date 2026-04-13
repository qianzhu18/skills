import type { Metadata } from "next";
import "./globals.css";
import "./hub.css";

export const metadata: Metadata = {
  title: "千逐 Skill 管理器",
  description:
    "持续构建中 · Product × Systems × Community",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
