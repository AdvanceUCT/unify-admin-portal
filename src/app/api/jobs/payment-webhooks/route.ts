import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const { QSTASH_CURRENT_SIGNING_KEY: currentSigningKey, QSTASH_NEXT_SIGNING_KEY: nextSigningKey, PAYMENT_WEBHOOK_DISPATCH_URL: url } = process.env;
  if (!currentSigningKey || !nextSigningKey || !url) return NextResponse.json({ error: "Dispatcher is not configured." }, { status: 503 });
  const signature = request.headers.get("upstash-signature");
  if (!signature) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 1024) return NextResponse.json({ error: "Invalid scheduler instruction." }, { status: 400 });
  try {
    if (!await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body, url })) throw new Error("Invalid signature");
  } catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }
  // Scheduler messages carry instructions only. Financial event payloads stay in the database.
  if (body.trim() !== "{}") return NextResponse.json({ error: "Invalid scheduler instruction." }, { status: 400 });
  const { dispatchPaymentWebhooks } = await import("@/lib/vendors/paymentWebhooks");
  return NextResponse.json(await dispatchPaymentWebhooks());
}
