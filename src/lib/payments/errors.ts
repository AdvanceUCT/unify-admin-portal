/**
 * @fileoverview Stable domain errors raised by payment wallet foundation services.
 * @module lib/payments/errors
 */

export type WalletErrorCode =
  | "ACCOUNT_CLOSED"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_SUSPENDED"
  | "BRANCH_NOT_PAYMENT_ENABLED"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_POSTING"
  | "PAYMENTS_DISABLED"
  | "UNSUPPORTED_CURRENCY"
  | "VENDOR_NOT_PAYMENT_ENABLED";

export class WalletDomainError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletDomainError";
  }
}
