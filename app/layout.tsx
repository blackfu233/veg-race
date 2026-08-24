import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: "Veggie Dash — 蔬菜跑跑",
    description: "雙角色策略 Crash Game 互動展示。最多同時兩注，十種角色玩法自由組合。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Veggie Dash — 蔬菜跑跑",
      description: "十種鮮明角色、雙注自由組合的手機 Crash Game Demo。",
      type: "website",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Veggie Dash 蔬菜角色在農場道路競跑" }],
    },
    twitter: { card: "summary_large_image", title: "Veggie Dash — 蔬菜跑跑", description: "雙角色策略 Crash Game 互動展示。", images: [socialImage] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
