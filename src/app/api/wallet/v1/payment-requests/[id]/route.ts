import { NextResponse } from "next/server";
import { posErrorResponse } from "@/lib/payments/posErrors";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { authenticateWalletBearer } = await import("@/lib/payments/walletSession");
  await authenticateWalletBearer(request);
  const { resolveStudentPaymentRequest } = await import("@/lib/payments/paymentRequests");
  return NextResponse.json(await resolveStudentPaymentRequest((await context.params).id), { headers: { "Cache-Control": "no-store" } });
 } catch(error) { return posErrorResponse(error); }
}
