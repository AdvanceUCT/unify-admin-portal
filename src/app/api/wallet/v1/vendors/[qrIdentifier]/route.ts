import { resolveWalletPaymentDestination } from "@/lib/payments/walletMobile";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";
import { authenticateWalletBearer } from "@/lib/payments/walletSession";

type Context = {
  params: Promise<{ qrIdentifier: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    await authenticateWalletBearer(request);
    const { qrIdentifier } = await context.params;
    const { vendorBranchId: _vendorBranchId, ...destination } = await resolveWalletPaymentDestination(qrIdentifier);
    return walletJson(destination);
  } catch (error) {
    return walletErrorResponse(error);
  }
}
