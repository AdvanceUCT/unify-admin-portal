import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";
import { schedulePaymentWebhookDispatch } from "@/lib/vendors/paymentWebhookAfter";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { authenticateWalletBearer } = await import("@/lib/payments/walletSession");
  const session = await authenticateWalletBearer(request);
  const { payPaymentRequest } = await import("@/lib/payments/paymentRequests");
  const result = await payPaymentRequest(session.studentId, (await context.params).id, await request.json());
  schedulePaymentWebhookDispatch();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
 } catch(error) {
  if (error instanceof PosApiError && error.code === "REQUEST_EXPIRED") schedulePaymentWebhookDispatch();
  return posErrorResponse(error);
 }
}
