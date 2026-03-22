import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        // Alle /v1/* Anfragen werden vom Next.js-Server ans Backend (Port 8000) weitergeleitet.
        // Das ist nötig damit Stripe-Webhooks (baddi.ch/v1/billing/webhook) ankommen,
        // und damit der Browser nicht direkt localhost:8000 aufrufen muss.
        source: "/v1/:path*",
        destination: "http://backend:8000/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
