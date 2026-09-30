import { NextResponse } from "next/server";
import { z } from "zod";
import { posErrorResponse } from "@/lib/payments/posErrors";
export async function GET(request: Request, context: { params: Promise<{ idempotencyKey: string }> }) {
  try {
    const { authenticateWalletBearer } = await import("@/lib/payments/walletSession");
    const session = await authenticateWalletBearer(request);
    const key = z.string().trim().min(1).max(128).parse((await context.params).idempotencyKey);
    const { getPayerPaymentReceipt } = await import("@/lib/payments/paymentReceipts");
    return NextResponse.json(await getPayerPaymentReceipt(session.studentId, { idempotencyKey: key }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return posErrorResponse(error); }
}
