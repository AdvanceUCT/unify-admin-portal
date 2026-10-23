/**
 * @fileoverview Client-safe wallet overview shape and the events that keep the payments page's wallet UI in sync.
 * @module app/vendor/(portal)/payments/walletOverview
 */

import type { getVendorPayoutOverview } from "@/lib/vendors/payouts";

type PayoutOverview = Awaited<ReturnType<typeof getVendorPayoutOverview>>;

/** Wallet state the payments page renders; payout batch references stay server-side. */
export type VendorWalletOverview = Omit<PayoutOverview, "recentBatches">;

/** Fired when something on the page knows the balance changed (new payment, refund, payout). */
export const WALLET_REFRESH_EVENT = "vendor-wallet:refresh";
/** Fired with the latest overview whenever the live wallet fetches one. */
export const WALLET_UPDATED_EVENT = "vendor-wallet:updated";

export function toVendorWalletOverview(overview: PayoutOverview): VendorWalletOverview {
  const { recentBatches, ...walletOverview } = overview;
  void recentBatches;
  return walletOverview;
}

export function requestWalletRefresh() {
  window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
}
