import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://chatgpt-ads.recruiting-gains.workers.dev"),
  title: "ChatGPT Ads — Transparent Campaign Health Check",
  description:
    "Turn a campaign export into clear totals, spend to review, qualified winners, and a practical action checklist using transparent rules.",
  applicationName: "ChatGPT Ads",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    title: "ChatGPT Ads — Transparent Campaign Health Check",
    description: "Upload a campaign CSV and get a fast, rule-based health check with no account or AI API.",
    siteName: "ChatGPT Ads",
  },
  twitter: {
    card: "summary",
    title: "ChatGPT Ads — Transparent Campaign Health Check",
    description: "Upload a campaign CSV and get a fast, rule-based health check with no account or AI API.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-beige text-dark-green antialiased font-sans">{children}</body>
    </html>
  );
}
