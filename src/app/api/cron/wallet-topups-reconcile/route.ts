import { env } from "@/lib/config/env";
import { reconcileStaleWalletTopups } from "@/lib/payments/topups";
import { reconcileStaleVendorWalletTopups } from "@/lib/vendors/walletTopups";
import { walletErrorResponse, walletJson } from "@/lib/payments/walletApi";

export async function GET(request: Request) {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return walletJson({ error: { code: "UNAUTHORIZED", message: "Unauthorized." } }, { status: 401 });
  }

  try {
    const summary = await reconcileStaleWalletTopups();
    const vendor = await reconcileStaleVendorWalletTopups();
    return walletJson({ ...summary, vendor });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
