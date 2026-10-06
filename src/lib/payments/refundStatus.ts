/**
 * @fileoverview Shared refund status and source derivation for spends (no refund window).
 * @module lib/payments/refundStatus
 */

export type RefundStatus = "NONE" | "PARTIALLY_REFUNDED" | "FULLY_REFUNDED";
export type RefundSource = "PORTAL" | "API";

const ZERO_MINOR = BigInt(0);

export function refundStatusFor(amountMinor: bigint, refundedMinor: bigint): RefundStatus {
  if (refundedMinor <= ZERO_MINOR) return "NONE";
  return refundedMinor >= amountMinor ? "FULLY_REFUNDED" : "PARTIALLY_REFUNDED";
}

/** Portal refunds record the acting user; API (POS) refunds do not. */
export function refundSource(refund: { initiatedByUserId: string | null }): RefundSource {
  return refund.initiatedByUserId ? "PORTAL" : "API";
}
