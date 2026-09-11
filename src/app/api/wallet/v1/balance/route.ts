import { getMobileWalletBalance } from "@/lib/payments/walletMobile";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";
import { authenticateWalletBearer } from "@/lib/payments/walletSession";

export async function GET(request: Request) {
  try {
    const session = await authenticateWalletBearer(request);
    return walletJson(await getMobileWalletBalance(session.studentId));
  } catch (error) {
    return walletErrorResponse(error);
  }
}
