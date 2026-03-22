import { NextRequest, NextResponse } from "next/server";
import http from "http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forwardToBackend(
  body: Buffer,
  stripeSignature: string,
  contentType: string
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "backend",
      port: 8000,
      path: "/v1/billing/webhook",
      method: "POST",
      headers: {
        "content-type": contentType,
        "stripe-signature": stripeSignature,
        "content-length": body.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 500, text: data }));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = Buffer.from(await req.arrayBuffer());
    const stripeSignature = req.headers.get("stripe-signature") ?? "";
    const contentType = req.headers.get("content-type") ?? "application/json";

    const { status, text } = await forwardToBackend(rawBody, stripeSignature, contentType);
    return new NextResponse(text, { status });
  } catch (err: unknown) {
    const detail = err instanceof Error
      ? `${err.message} | cause: ${String((err as NodeJS.ErrnoException).code ?? (err as Error & { cause?: unknown }).cause)}`
      : String(err);
    console.error("[webhook-proxy] Fehler:", detail);
    return new NextResponse(
      JSON.stringify({ error: "Webhook-Proxy-Fehler", detail }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
