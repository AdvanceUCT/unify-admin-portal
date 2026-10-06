/**
 * @fileoverview Stable domain errors raised by payment wallet foundation services.
 * @module lib/payments/errors
 */

export type WalletErrorCode =
  | "ACCOUNT_CLOSED"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_SUSPENDED"
  | "BRANCH_NOT_PAYMENT_ENABLED"
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_POSTING"
  | "INVALID_WALLET_SESSION"
  | "PAYMENT_FULLY_REFUNDED"
  | "PAYMENT_NOT_REFUNDABLE"
  | "PAYMENT_WALLET_NOT_ELIGIBLE"
  | "PAYMENT_WALLET_DISABLED"
  | "PAYMENT_OTP_DELIVERY_FAILED"
  | "RATE_LIMITED"
  | "REFUND_AMOUNT_EXCEEDED"
  | "PAYOUT_NOT_FOUND"
  | "TOPUP_ALREADY_IN_PROGRESS"
  | "TOPUP_AMOUNT_EXCEEDS_DEFICIT"
  | "TOPUP_AMOUNT_OUT_OF_RANGE"
  | "TOPUP_NOT_ALLOWED"
  | "TOPUP_NOT_FOUND"
  | "TOPUP_PROVIDER_MISMATCH"
  | "UNSUPPORTED_CURRENCY"
  | "VENDOR_NOT_PAYMENT_ENABLED"
  | "VENDOR_PAYMENT_SUSPENDED";

export class WalletDomainError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletDomainError";
  }
}
