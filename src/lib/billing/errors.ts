/**
 * @fileoverview Stable domain errors raised by vendor verification invoicing services.
 * @module lib/billing/errors
 */

export type BillingErrorCode =
  | "INVALID_MONEY"
  | "INVALID_CURRENCY"
  | "INVALID_BASIS_POINTS"
  | "INVALID_VENDOR"
  | "POLICY_NOT_FOUND"
  | "POLICY_CONFLICT";

export class BillingDomainError extends Error {
  constructor(
    public readonly code: BillingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BillingDomainError";
  }
}
