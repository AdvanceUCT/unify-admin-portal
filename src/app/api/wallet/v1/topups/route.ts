import { z } from "zod";

import { createWalletTopup } from "@/lib/payments/topups";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";
import { authenticateWalletBearer } from "@/lib/payments/walletSession";

const createTopupSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.literal("ZAR"),
  idempotencyKey: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const session = await authenticateWalletBearer(request);
    const body = createTopupSchema.parse(await request.json());
    const topup = await createWalletTopup({
      studentId: session.studentId,
      sessionId: session.sessionId,
      ...body,
    });
    return walletJson(topup, { status: 201 });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
