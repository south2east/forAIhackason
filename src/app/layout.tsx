import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "駅前スポット探索 | テーマで探す",
  description:
    "駅名とテーマを入力すると、Google Places・LLM要約・ベクトル類似度検索で周辺スポットをランキング表示します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
