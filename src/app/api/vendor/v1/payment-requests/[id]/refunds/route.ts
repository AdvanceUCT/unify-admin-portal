import { NextResponse } from "next/server";
import { z } from "zod";
import { WalletDomainError } from "@/lib/payments/errors";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";

const refundSchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();

/** Maps refund domain errors onto the vendor API contract (docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md §8.1). */
function apiError(error: unknown) {
  if (!(error instanceof WalletDomainError)) return error;
  switch (error.code) {
    case "VENDOR_PAYMENT_SUSPENDED":
    case "VENDOR_NOT_PAYMENT_ENABLED": return new PosApiError(error.code, error.message, 403);
    case "BRANCH_NOT_PAYMENT_ENABLED": return new PosApiError("BRANCH_NOT_ALLOWED", error.message, 403);
    case "PAYMENT_NOT_REFUNDABLE": return new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
    case "PAYMENT_FULLY_REFUNDED":
    case "REFUND_AMOUNT_EXCEEDED":
    case "IDEMPOTENCY_CONFLICT": return new PosApiError(error.code, error.message, 409);
    default: return error;
  }
}

/** Handles POST requests to `/api/vendor/v1/payment-requests/[id]/refunds` (referenced POS refunds). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { vendorFromApiRequest } = await import("@/lib/vendors/routeAuth");
  const access = await vendorFromApiRequest(request, "refunds:create");
  if (!access) throw new PosApiError("INVALID_API_KEY", "Invalid vendor API key.", 401);
  const body = refundSchema.parse(await request.json());
  const id = (await context.params).id;
  const [{ listActivePaymentBranchIdsForContext }, { refundSpend }, { getMerchantPaymentRequest }] = await Promise.all([
    import("@/lib/payments/branchOnboarding"), import("@/lib/vendors/refunds"), import("@/lib/payments/paymentRequests"),
  ]);
  const allowedBranchIds = await listActivePaymentBranchIdsForContext({ vendorProfileId: access.id, branchIds: access.branchIds });
  const result = await refundSpend({
    vendorProfileId: access.id, allowedBranchIds, target: { paymentRequestId: id },
    amountMinor: body.amountMinor, idempotencyKey: body.idempotencyKey, actor: { apiCredentialId: access.credentialId },
  });
  const paymentRequest = await getMerchantPaymentRequest(access, id);
  return NextResponse.json({
    refund: { ...result.refund, paymentRequestId: id, transactionId: result.originalTransactionId },
    paymentRequest,
  }, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
 } catch (error) { return posErrorResponse(apiError(error)); }
}
