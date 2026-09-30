import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";
import { schedulePaymentWebhookDispatch } from "@/lib/vendors/paymentWebhookAfter";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { vendorFromApiRequest } = await import("@/lib/vendors/routeAuth");
  const access = await vendorFromApiRequest(request, "payments:read");
  if (!access) throw new PosApiError("INVALID_API_KEY", "Invalid vendor API key.", 401);
  const { getMerchantPaymentRequest } = await import("@/lib/payments/paymentRequests");
  const result = await getMerchantPaymentRequest(access, (await context.params).id);
  if (result.status === "EXPIRED") schedulePaymentWebhookDispatch();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
 } catch(error) { return posErrorResponse(error); }
}
