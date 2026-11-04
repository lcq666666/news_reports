import "./globals.css";

export const metadata = {
  title: "每日新闻播报 · news_reports",
  description: "中文每日新闻播报骨架：政治、军事、时事、科研、大模型、人工智能 + 今日值得一试。当前为示例数据。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
