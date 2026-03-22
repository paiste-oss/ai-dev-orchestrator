import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const rawBody = Buffer.from(await req.arrayBuffer());
    const stripeSignature = req.headers.get("stripe-signature") ?? "";
    const contentType = req.headers.get("content-type") ?? "application/json";

    const backendRes = await fetch("http://backend:8000/v1/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": contentType,
        "stripe-signature": stripeSignature,
        "content-length": String(rawBody.length),
      },
      body: rawBody,
      // @ts-expect-error - Node.js fetch: Duplex für Streaming deaktivieren
      duplex: "half",
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
