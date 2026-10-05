import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Office — Your project companion',
  description:
    'A cozy, read-only office for project activity. Real task signals stay local. Sample activity is clearly labeled.',
  icons: { icon: '/robot.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* oxlint-disable-next-line next/no-page-custom-font -- App Router root layout: preserve the existing remote-font/CSP fallback contract on every route. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist&display=swap"
        />
        {/* oxlint-disable-next-line next/no-page-custom-font -- App Router root layout: preserve the existing remote-font/CSP fallback contract on every route. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist+Mono&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
