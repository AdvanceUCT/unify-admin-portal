/**
 * @fileoverview Stable domain errors raised by the Paystack provider adapter.
 * @module lib/paymentProviders/paystack/errors
 */

export type PaystackErrorCode =
  | "NOT_CONFIGURED"
  | "MODE_MISMATCH"
  | "SUBACCOUNT_INACTIVE"
  | "SUBACCOUNT_CURRENCY_MISMATCH"
  | "INTEGRATION_MISMATCH"
  | "AMOUNT_TOO_SMALL"
  | "AMOUNT_UNSAFE"
  | "HTTP_ERROR"
  | "MALFORMED_RESPONSE"
  | "TIMEOUT"
  | "UNKNOWN_OUTCOME";

export class PaystackProviderError extends Error {
  constructor(
    public readonly code: PaystackErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PaystackProviderError";
  }
}
