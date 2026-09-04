/**
 * @fileoverview Handles the `/api/webhooks/paystack` API boundary, including its authorization and request validation.
 * @module app/api/webhooks/paystack/route
 *
 * Backstop for `/api/vendor/invoices/callback`: the callback route completes
 * payment on the vendor's redirect back from checkout, but a vendor closing
 * the tab before that redirect lands would otherwise leave the invoice
 * unpaid despite Paystack having settled it. This webhook confirms the same
 * event server-to-server. `completeInvoicePayment` is idempotent, so
 * whichever of the two fires first wins and the other is a no-op.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { completeInvoicePayment } from "@/lib/billing/invoiceService";
import { env } from "@/lib/config/env";

function signaturesMatch(actual: string | null, expected: string) {
  if (!actual) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/** Receives incoming webhook events from Paystack. Validates the HMAC signature before processing. */
export async function POST(request: Request) {
  const body = await request.text();

  if (!env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: { message: "PAYSTACK_SECRET_KEY is not configured." } }, { status: 500 });
  }

  const expectedSignature = createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
  if (!signaturesMatch(request.headers.get("x-paystack-signature"), expectedSignature)) {
    return NextResponse.json({ error: { message: "Invalid webhook signature." } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: { message: "Webhook payload must be valid JSON." } }, { status: 400 });
  }

  const event = payload as { event?: string; data?: { reference?: string; metadata?: Record<string, unknown> } };

  if (event.event === "charge.success") {
    const reference = event.data?.reference;
    const metadata = event.data?.metadata ?? {};
    const invoiceId = typeof metadata.invoiceId === "string" ? metadata.invoiceId : undefined;
    const type = metadata.type;

    // TOPUP handling (wallet credit purchases) would be added here alongside
    // INVOICE_PAYMENT once a wallet/ledger system exists in this schema.

    if (type === "INVOICE_PAYMENT" && invoiceId && reference) {
      try {
        await completeInvoicePayment(invoiceId, reference);
      } catch (error) {
        console.error("Invoice payment webhook error:", error);
      }
    }
  }

  return NextResponse.json({ received: true }, { status: 202 });
}
