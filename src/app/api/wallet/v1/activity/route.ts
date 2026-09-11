import { listMobileWalletActivity } from "@/lib/payments/walletMobile";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";
import { authenticateWalletBearer } from "@/lib/payments/walletSession";

export async function GET(request: Request) {
  try {
    const session = await authenticateWalletBearer(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    return walletJson(await listMobileWalletActivity(session.studentId, limit));
  } catch (error) {
    return walletErrorResponse(error);
  }
}
