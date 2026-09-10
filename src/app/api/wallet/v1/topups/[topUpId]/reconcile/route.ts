import { reconcileWalletTopup } from "@/lib/payments/topups";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";
import { authenticateWalletBearer } from "@/lib/payments/walletSession";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topUpId: string }> },
) {
  try {
    const session = await authenticateWalletBearer(request);
    const { topUpId } = await params;
    const topup = await reconcileWalletTopup({ studentId: session.studentId, topUpId });
    return walletJson(topup);
  } catch (error) {
    return walletErrorResponse(error);
  }
}
