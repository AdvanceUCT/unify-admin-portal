import { authenticateWalletBearer, revokeStudentPaymentSession } from "@/lib/payments/walletSession";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";

export async function POST(request: Request) {
  try {
    const session = await authenticateWalletBearer(request);
    await revokeStudentPaymentSession({ sessionId: session.sessionId });
    return walletJson({ revoked: true });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
