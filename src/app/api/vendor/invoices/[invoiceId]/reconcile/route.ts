/**
 * @fileoverview Handles the `/api/vendor/invoices/[invoiceId]/reconcile` API boundary.
 * @module app/api/vendor/invoices/[invoiceId]/reconcile/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { isRateLimited, isSameOriginRequest } from "@/lib/billing/paymentRouteGuards";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { prisma } from "@/lib/db/prisma";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";

/**
 * Handles POST requests to `/api/vendor/invoices/[invoiceId]/reconcile`.
 * Owner only. Resolves the invoice's own most recent unresolved attempt
 * server-side — it never accepts a client-supplied provider reference, per
 * the handoff ("resolves stored attempt rather than accepting arbitrary
 * provider references").
 */
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const owner = await getVendorInvoiceOwnerContext(session.user.id);
  if (!owner) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: { message: "Cross-origin requests are not allowed." } }, { status: 403 });
  }

  const { invoiceId } = await context.params;

  if (isRateLimited(`reconcile:${owner.vendorProfileId}:${invoiceId}`)) {
    return NextResponse.json({ error: { message: "Too many requests. Please wait a moment and try again." } }, { status: 429 });
  }

  const invoice = await prisma.vendorInvoice.findFirst({
    where: { id: invoiceId, vendorProfileId: owner.vendorProfileId },
    select: { id: true, paymentStatus: true },
  });
  if (!invoice) return NextResponse.json({ error: { message: "Invoice was not found." } }, { status: 404 });

  if (invoice.paymentStatus !== "UNPAID") {
    return NextResponse.json({ outcome: "already_settled", paymentStatus: invoice.paymentStatus });
  }

  const attempt = await prisma.vendorInvoicePaymentAttempt.findFirst({
    where: { invoiceId, status: { in: ["READY", "PENDING", "UNKNOWN"] } },
    orderBy: { createdAt: "desc" },
    select: { reference: true },
  });
  if (!attempt) {
    return NextResponse.json({ error: { message: "There is no payment attempt to reconcile for this invoice." } }, { status: 404 });
  }

  let config;
  try {
    config = resolvePaystackProviderConfig();
  } catch {
    return NextResponse.json({ error: { message: "The payment provider is not configured." } }, { status: 503 });
  }

  const result = await confirmInvoicePayment(prisma, { reference: attempt.reference, config });
  return NextResponse.json({ outcome: result.outcome });
}
