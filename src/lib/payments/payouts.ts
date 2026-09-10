/**
 * @fileoverview Reports vendor payout accrual, pending a wallet/ledger schema.
 * @module lib/payments/payouts
 */

import "server-only";

export type VendorPayoutSummary = {
  vendorProfileId: string;
  companyName: string;
  accruedSinceLastPayout: number;
  lastPayoutDate: Date | null;
  lastPayoutAmount: number | null;
};

/**
 * TODO: this codebase has no wallet/ledger schema yet — no model records
 * student top-ups or vendor-spend debits/credits (confirmed by searching
 * schema.prisma and the wider codebase; the only "wallet" references are the
 * unrelated verifiable-credentials holder wallet app and the `PayoutCadence`
 * enum on `UniversityPaymentSettings`). Real vendor accrual and payout
 * history cannot be computed until something like a `WalletTransaction`
 * model exists to record top-ups and per-vendor spend.
 *
 * This returns an empty list so the payout dashboard has a real, typed data
 * source to render against today, without fabricating numbers. Once a
 * ledger model exists, replace this body with an aggregation query (sum of
 * vendor-spend entries since each vendor's last recorded payout) — the
 * `VendorPayoutSummary` shape above is what the UI already expects.
 */
export async function getVendorPayoutSummaries(): Promise<VendorPayoutSummary[]> {
  return [];
}
