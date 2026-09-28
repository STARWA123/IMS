import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfferTrack",
  description: "本地秋招信息管理系统",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
