/**
 * @fileoverview Handles vendor-initiated internal wallet refunds.
 * @module app/api/vendor/payments/[transactionId]/refund/route
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { WalletDomainError } from "@/lib/payments/errors";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { createVendorPaymentRefund } from "@/lib/vendors/refunds";

const refundSchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.string().trim().min(1).max(128),
});

function refundErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Refund request is invalid." } },
      { status: 400 },
    );
  }
  if (error instanceof WalletDomainError) {
    const status =
      error.code === "IDEMPOTENCY_CONFLICT" ? 409 :
      error.code === "ACCOUNT_NOT_FOUND" ? 404 :
      error.code === "INSUFFICIENT_FUNDS" ? 409 :
      error.code === "PAYMENT_WALLET_DISABLED" ? 503 :
      400;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Unable to refund this payment." } },
    { status: 500 },
  );
}

/** Handles POST requests to `/api/vendor/payments/[transactionId]/refund`. */
export async function POST(
  request: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    const session = await getCurrentVendorSession();
    if (!session || session.user.userType !== "VENDOR") {
      return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
    }

    const vendorContext = await getApprovedVendorContextForUser(session.user.id);
    if (!vendorContext) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    const { transactionId } = await context.params;
    const body = refundSchema.parse(await request.json());
    const refund = await createVendorPaymentRefund({
      context: vendorContext,
      transactionId,
      amountMinor: body.amountMinor,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(refund, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return refundErrorResponse(error);
  }
}
