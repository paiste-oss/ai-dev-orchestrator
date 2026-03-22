import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        // Alle /v1/* Anfragen ans Backend weiterleiten
        source: "/v1/:path*",
        destination: "http://backend:8000/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
