import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebPilot Agent",
  description: "面向网页调研、结构化抽取和引用报告生成的浏览器工作流 Agent。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
