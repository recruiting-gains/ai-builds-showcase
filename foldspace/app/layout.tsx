import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foldspace — Five rooms. One impossible way home.",
  description:
    "A playable puzzle of impossible rooms. Turn a doorway, change its destination, and find a way home. An experiment by Cruz Garza.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
