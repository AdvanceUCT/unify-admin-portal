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
  | "POLICY_CONFLICT"
  | "UNIVERSITY_NOT_CONFIGURED"
  | "INVOICE_NOT_PAYABLE"
  | "ATTEMPT_IN_PROGRESS"
  | "ATTEMPT_NOT_FOUND"
  | "PAYMENT_MISMATCH";

export class BillingDomainError extends Error {
  constructor(
    public readonly code: BillingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BillingDomainError";
  }
}
