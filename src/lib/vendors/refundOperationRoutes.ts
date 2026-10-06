import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentVendorSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/billing/paymentRouteGuards";
import { PosApiError, posErrorResponse } from "@/lib/payments/posErrors";
import { refundRegistrationSchema } from "@/lib/payments/refundOperationContract";
import { getApprovedVendorContextForUser } from "./context";
import { authenticateVendorApiKey } from "./integrations";
import { getPendingRefundOperation, refundOperation, registerRefundOperation, type RefundAccess } from "./refundOperations";

export async function refundAccess(request: Request, api: boolean): Promise<RefundAccess> {
  if (api) {
    const vendor = await authenticateVendorApiKey(request.headers.get("authorization"), "refunds:create", true);
    if (!vendor) throw new PosApiError("INVALID_API_KEY", "Invalid vendor API key.", 401);
    return { vendorProfileId: vendor.id, actor: { apiCredentialId: vendor.credentialId } };
  }
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") throw new PosApiError("UNAUTHORIZED", "Sign in to recover this refund.", 401);
  const context = await getApprovedVendorContextForUser(session.user.id, true);
  if (!context) throw new PosApiError("FORBIDDEN", "Vendor membership is unavailable.", 403);
  return { vendorProfileId: context.vendorProfileId, actor: { userId: context.userId } };
}

export function refundJson(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
export async function refundOperationCollection(request: Request, api: boolean) {
  try {
    const access = await refundAccess(request, api);
    if (request.method === "GET") return refundJson(await getPendingRefundOperation(access));
    if (!api && !isSameOriginRequest(request)) throw new PosApiError("FORBIDDEN", "Cross-origin refund requests are not allowed.", 403);
    const schema = refundRegistrationSchema.extend(api ? { paymentRequestId: z.string().min(1) } : { transactionId: z.string().min(1) }).strict();
    const body = schema.parse(await request.json());
    const target = "paymentRequestId" in body ? { paymentRequestId: body.paymentRequestId! } : { transactionId: body.transactionId! };
    return refundJson(await registerRefundOperation(access, { target, amountMinor: body.amountMinor, idempotencyKey: body.idempotencyKey }));
  } catch (error) { return posErrorResponse(error); }
}
export async function refundOperationItem(request: Request, api: boolean, id: string, action: "read" | "execute" | "cancel") {
  try {
    const access = await refundAccess(request, api);
    if (!api && action !== "read" && !isSameOriginRequest(request)) throw new PosApiError("FORBIDDEN", "Cross-origin refund requests are not allowed.", 403);
    if (action !== "read") { const body = await request.text(); z.object({}).strict().parse(body ? JSON.parse(body) : {}); }
    return refundJson(await refundOperation(access, id, action));
  } catch (error) { return posErrorResponse(error); }
}
