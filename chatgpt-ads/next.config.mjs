/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare's edge network doesn't run Next.js's default (Node-based)
  // image optimizer, so serve images unoptimized. This keeps the config
  // edge-compatible for Cloudflare Pages while remaining a no-op on Vercel
  // since this app doesn't rely on next/image optimization.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
