import type { NextConfig } from "next";

// Docker-intern: BACKEND_INTERNAL_URL=http://backend:8000
// Vercel/Prod:   NEXT_PUBLIC_BACKEND_URL=https://api.baddi.ch (aus .env.production)
const BACKEND_PROXY =
  process.env.BACKEND_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://api.baddi.ch";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ["@excalidraw/excalidraw"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${BACKEND_PROXY}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
