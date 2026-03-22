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
      {
        // Stripe-Webhooks über n8n abwickeln (n8n → Backend, kein Turbopack-DNS-Problem)
        source: "/webhook/n8n/:path*",
        destination: "http://n8n:5678/webhook/:path*",
      },
    ];
  },
};

export default nextConfig;
