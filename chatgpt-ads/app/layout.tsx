import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatGPT Ads — The Paid-Ads Operating System",
  description:
    "Turn ChatGPT into a complete marketing agency. Audit campaigns, find wasted spend, discover winning ads, and get an optimization plan — instantly, free.",
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
