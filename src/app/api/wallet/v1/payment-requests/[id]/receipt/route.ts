import { NextResponse } from "next/server";
import { posErrorResponse } from "@/lib/payments/posErrors";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const { authenticateWalletBearer } = await import("@/lib/payments/walletSession");
  const session = await authenticateWalletBearer(request);
  const { getStudentRequestReceipt } = await import("@/lib/payments/paymentRequests");
  return NextResponse.json(await getStudentRequestReceipt(session.studentId, (await context.params).id), { headers: { "Cache-Control": "no-store" } });
 } catch(error) { return posErrorResponse(error); }
}
