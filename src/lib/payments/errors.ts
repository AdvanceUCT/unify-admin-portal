/**
 * @fileoverview Stable domain errors raised by payment wallet foundation services.
 * @module lib/payments/errors
 */

export type WalletErrorCode =
  | "ACCOUNT_CLOSED"
  | "ACCOUNT_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_POSTING"
  | "PAYMENTS_DISABLED"
  | "UNSUPPORTED_CURRENCY";

export class WalletDomainError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletDomainError";
  }
}
