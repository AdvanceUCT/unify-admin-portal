import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";
import { schedulePaymentWebhookDispatch } from "@/lib/vendors/paymentWebhookAfter";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { vendorFromApiRequest } = await import("@/lib/vendors/routeAuth");
  const access = await vendorFromApiRequest(request, "payments:cancel");
  if (!access) throw new PosApiError("INVALID_API_KEY", "Invalid vendor API key.", 401);
  const { cancelPaymentRequest } = await import("@/lib/payments/paymentRequests");
  const result = await cancelPaymentRequest(access, (await context.params).id);
  schedulePaymentWebhookDispatch();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
 } catch(error) { return posErrorResponse(error); }
}
