import { z } from "zod";

import { verifyStudentPaymentActivation } from "@/lib/payments/walletSession";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";

const activationVerifySchema = z.object({
  challengeId: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/),
  deviceId: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const body = activationVerifySchema.parse(await request.json());
    const session = await verifyStudentPaymentActivation(body);
    return walletJson(session);
  } catch (error) {
    return walletErrorResponse(error);
  }
}
