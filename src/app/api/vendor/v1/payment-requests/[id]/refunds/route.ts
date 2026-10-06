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

/** Compatibility endpoint: registration is durable before execution starts. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { refundAccess, refundJson } = await import("@/lib/vendors/refundOperationRoutes");
  const access = await refundAccess(request, true);
  const body = refundSchema.parse(await request.json());
  const id = (await context.params).id;
  const { legacyRefundOperation } = await import("@/lib/vendors/refundOperations");
  const op = await legacyRefundOperation(access, { target: { paymentRequestId: id }, ...body });
  if (op.status !== "COMPLETED" || !op.result) return refundJson({ error: op.rejection ? { ...op.rejection, code: op.rejection.code === "BRANCH_NOT_PAYMENT_ENABLED" ? "BRANCH_NOT_ALLOWED" : op.rejection.code } : { code: "REFUND_CANCELLED", message: "This refund was cancelled." }, operation: op }, op.rejection?.status ?? 409);
  const { getMerchantPaymentRequest } = await import("@/lib/payments/paymentRequests");
  const { authenticateVendorApiKey } = await import("@/lib/vendors/integrations");
  const vendor = await authenticateVendorApiKey(request.headers.get("authorization"), "refunds:create", true);
  if (!vendor) throw new PosApiError("INVALID_API_KEY", "Invalid vendor API key.", 401);
  const paymentRequest = await getMerchantPaymentRequest({ id: vendor.id, branchIds: vendor.branchIds }, id);
  return refundJson({ refund: { ...op.result.refund, paymentRequestId: id, transactionId: op.result.originalTransactionId }, paymentRequest, operation: op }, op.result.replayed ? 200 : 201);
 } catch (error) { return posErrorResponse(apiError(error)); }
}
