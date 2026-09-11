/**
 * @fileoverview Shared non-secret constants for the ZAR payment wallet ledger.
 * @module lib/payments/constants
 */

export const WALLET_CURRENCY = "ZAR" as const;
export const PAYFAST_SANDBOX_PROVIDER = "PAYFAST_SANDBOX" as const;
export const PAYSTACK_WALLET_PROVIDER = "PAYSTACK" as const;
export const WALLET_TOPUP_REFERENCE_PREFIX = "unify-wlt-" as const;

export const WALLET_SYSTEM_ACCOUNTS = [
  "GATEWAY_CLEARING",
  "PAYOUT_CLEARING",
] as const;

export type WalletSystemAccountCode = (typeof WALLET_SYSTEM_ACCOUNTS)[number];
