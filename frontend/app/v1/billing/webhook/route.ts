import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe Webhook Proxy
 *
 * Next.js rewrites (next.config.ts) können bei POST-Requests den Raw-Body
 * verändern, was die Stripe-Signaturprüfung zerstört.
 * Diese Route leitet den Request mit exakt den gleichen Bytes und Headers
 * direkt ans Backend weiter.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.arrayBuffer();
    const stripeSignature = req.headers.get("stripe-signature") ?? "";

    const backendRes = await fetch("http://backend:8000/v1/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        "stripe-signature": stripeSignature,
      },
      body: rawBody,
    });

    const text = await backendRes.text();
    return new NextResponse(text, { status: backendRes.status });
  } catch (err) {
    console.error("[webhook-proxy] Fehler:", err);
    return new NextResponse(
      JSON.stringify({ error: "Webhook-Proxy-Fehler", detail: String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
