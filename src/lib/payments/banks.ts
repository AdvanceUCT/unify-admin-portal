import "server-only";
import { unstable_cache } from "next/cache";

export async function payoutBanks() {
  const { resolvePaystackWalletTopupConfig } = await import("@/lib/paymentProviders/paystack/config");
  const { listSouthAfricanBanks } = await import("@/lib/paymentProviders/paystack/client");
  const config = resolvePaystackWalletTopupConfig();
  // Keys and bank-account input never enter the cache key or its persisted result.
  return unstable_cache(() => listSouthAfricanBanks(config.secretKey, config.baseUrl), ["vendor-payout-banks", config.baseUrl, "ZAR"], { revalidate: 900 })();
}
