import { z } from "zod";

import { submitWalletPayment } from "@/lib/payments/walletMobile";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";
import { authenticateWalletBearer } from "@/lib/payments/walletSession";

const paymentSchema = z.object({
  qrIdentifier: z.string().min(1),
  amountMinor: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const session = await authenticateWalletBearer(request);
    const body = paymentSchema.parse(await request.json());
    return walletJson(await submitWalletPayment({ studentId: session.studentId, ...body }));
  } catch (error) {
    return walletErrorResponse(error);
  }
}
