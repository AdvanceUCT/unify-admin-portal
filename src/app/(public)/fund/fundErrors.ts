/**
 * @fileoverview Fixed, funder-safe error messages for the public funding form.
 * @module app/(public)/fund/fundErrors
 */

import { env } from "@/lib/config/env";
import { formatMoneyMinor } from "@/lib/formatters";
import { WalletDomainError } from "@/lib/payments/errors";

/**
 * The form redirects with one of these keys, never with message text, so a
 * crafted `/fund?fundError=` link can't put arbitrary words on this public page.
 */
export type FundErrorKey = "not_eligible" | "amount" | "rate_limited" | "unavailable" | "failed";

export function fundErrorKeyFor(error: unknown): FundErrorKey {
  if (!(error instanceof WalletDomainError)) return "failed";
  switch (error.code) {
    case "FUNDING_RECIPIENT_NOT_ELIGIBLE":
      return "not_eligible";
    case "TOPUP_AMOUNT_OUT_OF_RANGE":
      return "amount";
    case "RATE_LIMITED":
      return "rate_limited";
    case "PAYMENT_WALLET_DISABLED":
      return "unavailable";
    default:
      return "failed";
  }
}

/** Unknown keys fall back to the generic message rather than echoing input. */
export function fundErrorMessage(key: string | undefined) {
  switch (key) {
    case undefined:
    case "":
      return null;
    case "not_eligible":
      return "We couldn't accept funding for that student. Check the student number and surname.";
    case "amount":
      return `Enter an amount between ${formatMoneyMinor(env.PAYMENT_TOPUP_MIN_MINOR)} and ${formatMoneyMinor(env.PAYMENT_TOPUP_MAX_MINOR)}.`;
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "unavailable":
      return "Funding is currently unavailable.";
    default:
      return "We couldn't start the payment. Please try again.";
  }
}
