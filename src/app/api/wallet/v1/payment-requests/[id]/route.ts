import { NextResponse } from "next/server";
import { posErrorResponse } from "@/lib/payments/posErrors";
import { schedulePaymentWebhookDispatch } from "@/lib/vendors/paymentWebhookAfter";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { authenticateWalletBearer } = await import("@/lib/payments/walletSession");
  await authenticateWalletBearer(request);
  const { resolveStudentPaymentRequest } = await import("@/lib/payments/paymentRequests");
  const result = await resolveStudentPaymentRequest((await context.params).id);
  if (result.status === "EXPIRED") schedulePaymentWebhookDispatch();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
 } catch(error) { return posErrorResponse(error); }
}
