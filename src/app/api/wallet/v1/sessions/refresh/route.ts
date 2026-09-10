import { z } from "zod";

import { refreshStudentPaymentSession } from "@/lib/payments/walletSession";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
  sessionId: z.string().min(1),
  deviceId: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const body = refreshSchema.parse(await request.json());
    const session = await refreshStudentPaymentSession(body);
    return walletJson(session);
  } catch (error) {
    return walletErrorResponse(error);
  }
}
