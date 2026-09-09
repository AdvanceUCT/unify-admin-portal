/**
 * @fileoverview Handles the `/api/vendor/invoices/[invoiceId]/payment-attempts` API boundary.
 * @module app/api/vendor/invoices/[invoiceId]/payment-attempts/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { BillingDomainError } from "@/lib/billing/errors";
import { isRateLimited, isSameOriginRequest } from "@/lib/billing/paymentRouteGuards";
import { prepareInvoicePaymentAttempt } from "@/lib/billing/paymentAttempts";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

/**
 * Handles POST requests to `/api/vendor/invoices/[invoiceId]/payment-attempts`.
 * Owner only; the request body carries no money or recipient — the server
 * always chooses those from the invoice's own stored, immutable totals.
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

  if (isRateLimited(`payment-attempt:${owner.vendorProfileId}:${invoiceId}`)) {
    return NextResponse.json({ error: { message: "Too many requests. Please wait a moment and try again." } }, { status: 429 });
  }

  const invoice = await prisma.vendorInvoice.findFirst({
    where: { id: invoiceId, vendorProfileId: owner.vendorProfileId },
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: { message: "Invoice was not found." } }, { status: 404 });

  if (!env.VERIFICATION_INVOICE_CHECKOUT_ENABLED) {
    return NextResponse.json({ error: { message: "Checkout is not enabled." } }, { status: 503 });
  }

  let config;
  try {
    config = resolvePaystackProviderConfig();
  } catch {
    return NextResponse.json({ error: { message: "The payment provider is not configured." } }, { status: 503 });
  }

  try {
    const result = await prepareInvoicePaymentAttempt(prisma, {
      invoiceId,
      ownerUserId: session.user.id,
      config,
      callbackUrl: `${env.APP_URL}/vendor/invoices/${invoiceId}/payment-return`,
    });

    return NextResponse.json({
      status: result.status,
      accessCode: result.accessCode,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    });
  } catch (error) {
    if (error instanceof BillingDomainError) {
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: 409 });
    }
    if (error instanceof PaystackProviderError) {
      return NextResponse.json({ error: { message: "The payment provider rejected the request.", code: error.code } }, { status: 502 });
    }
    throw error;
  }
}
