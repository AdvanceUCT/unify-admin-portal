/**
 * @fileoverview Handles the `/api/vendor/invoices/pay` API boundary, including its authorization and request validation.
 * @module app/api/vendor/invoices/pay/route
 */

import { NextResponse } from "next/server";

import { initiateInvoicePayment } from "@/lib/billing/invoiceService";
import { requireApprovedVendorContext } from "@/lib/vendors/context";

/** Handles POST requests to `/api/vendor/invoices/pay`. */
export async function POST(request: Request) {
  const { context, session } = await requireApprovedVendorContext();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const invoiceId = body && typeof body === "object" ? (body as Record<string, unknown>).invoiceId : undefined;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) {
    return NextResponse.json({ error: "invoiceId is required." }, { status: 400 });
  }

  const vendorEmail = session.user.email;
  if (!vendorEmail) {
    return NextResponse.json({ error: "Vendor email not found." }, { status: 400 });
  }

  try {
    const { authorizationUrl, reference } = await initiateInvoicePayment(
      invoiceId,
      context.vendorProfileId,
      vendorEmail,
    );
    return NextResponse.json({ paymentUrl: authorizationUrl, reference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to initiate payment.";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "Invoice is already paid") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
