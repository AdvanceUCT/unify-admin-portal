/**
 * @fileoverview Handles the `/api/vendor/invoices/callback` API boundary — the browser redirect Paystack sends after checkout.
 * @module app/api/vendor/invoices/callback/route
 */

import { NextResponse } from "next/server";

import { completeInvoicePayment } from "@/lib/billing/invoiceService";
import { verifyTransaction } from "@/lib/payments/paystackService";

/** Handles GET requests to `/api/vendor/invoices/callback`. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");

  if (!reference) {
    return NextResponse.redirect(new URL("/vendor/invoices?payment=failed", request.url));
  }

  try {
    const result = await verifyTransaction(reference);

    if (result.status === "success") {
      const metadata = (result.metadata ?? {}) as { invoiceId?: string; type?: string };
      if (metadata.type === "INVOICE_PAYMENT" && metadata.invoiceId) {
        await completeInvoicePayment(metadata.invoiceId, reference);
      }
      return NextResponse.redirect(new URL("/vendor/invoices?payment=success", request.url));
    }

    return NextResponse.redirect(new URL("/vendor/invoices?payment=failed", request.url));
  } catch (error) {
    console.error("Invoice payment callback error:", error);
    return NextResponse.redirect(new URL("/vendor/invoices?payment=error", request.url));
  }
}
