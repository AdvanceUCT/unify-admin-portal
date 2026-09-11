import { z } from "zod";

import { requestStudentPaymentActivation } from "@/lib/payments/walletSession";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";

const activationRequestSchema = z.object({
  studentNumber: z.string().min(1),
  deviceId: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const body = activationRequestSchema.parse(await request.json());
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const activation = await requestStudentPaymentActivation({ ...body, ipAddress });
    return walletJson(activation, { status: "accessToken" in activation ? 200 : 202 });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
