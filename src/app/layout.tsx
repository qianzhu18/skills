import type { Metadata } from "next";
import "./globals.css";
import "./hub.css";

export const metadata: Metadata = {
  title: "Qianzhu Skill Store",
  description:
    "A local-first skill manager for Claude, Codex, and agent skill libraries.",
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
