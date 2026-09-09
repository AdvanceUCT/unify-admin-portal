/**
 * @fileoverview Exact integer-cents money math for vendor verification invoicing.
 * @module lib/billing/money
 */

import { BillingDomainError } from "@/lib/billing/errors";

const BASIS_POINTS_DENOMINATOR = BigInt(10_000);
const HALF_UP_ROUNDING_OFFSET = BigInt(5_000);
const ZERO_MINOR = BigInt(0);
const CENTS_PER_UNIT = BigInt(100);
const PERCENTAGE_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

export function assertSupportedCurrency(currency: string) {
  if (currency !== "ZAR") {
    throw new BillingDomainError("INVALID_CURRENCY", `Unsupported currency "${currency}". Only ZAR is supported.`);
  }
}

function assertNonNegativeMinor(amountMinor: bigint, fieldName: string) {
  if (amountMinor < ZERO_MINOR) {
    throw new BillingDomainError("INVALID_MONEY", `${fieldName} must be nonnegative.`);
  }
}

function assertValidBasisPoints(basisPoints: number) {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new BillingDomainError(
      "INVALID_BASIS_POINTS",
      "platformBasisPoints must be an integer between 0 and 10000.",
    );
  }
}

/**
 * Splits a nonnegative fee into the platform's and university's shares using
 * half-up rounding on the platform side, per
 * docs/paystack-vendor-invoicing-implementation-plan.md §4:
 * `platformMinor = floor((F * B + 5000) / 10000)`.
 */
export function computeVerificationShares(feeMinor: bigint, platformBasisPoints: number) {
  assertNonNegativeMinor(feeMinor, "feeMinor");
  assertValidBasisPoints(platformBasisPoints);

  const platformMinor = (feeMinor * BigInt(platformBasisPoints) + HALF_UP_ROUNDING_OFFSET) / BASIS_POINTS_DENOMINATOR;
  const universityMinor = feeMinor - platformMinor;

  return { platformMinor, universityMinor };
}

/**
 * Parses an admin-entered percentage with up to two decimal places (e.g.
 * "10", "10.5", "10.00") into exact basis points without floating-point
 * multiplication.
 */
export function parsePercentageToBasisPoints(input: string): number {
  const match = PERCENTAGE_PATTERN.exec(input.trim());
  if (!match) {
    throw new BillingDomainError("INVALID_BASIS_POINTS", 'Percentage must look like "10" or "10.00".');
  }

  const wholePart = Number(match[1]);
  const fractionalPart = (match[2] ?? "").padEnd(2, "0");
  const basisPoints = wholePart * 100 + Number(fractionalPart);

  if (basisPoints < 0 || basisPoints > 10_000) {
    throw new BillingDomainError("INVALID_BASIS_POINTS", "Percentage must be between 0 and 100.");
  }

  return basisPoints;
}

/** Exact integer string for JSON transport — never a raw `bigint` or a rounded float. */
export function serializeMinor(amountMinor: bigint): string {
  return amountMinor.toString();
}

/** Human-readable decimal string (e.g. `1050n` -> `"10.50"`) for a two-decimal currency. */
export function minorToDecimalString(amountMinor: bigint, currency: string): string {
  assertSupportedCurrency(currency);

  const negative = amountMinor < ZERO_MINOR;
  const absoluteMinor = negative ? -amountMinor : amountMinor;
  const whole = absoluteMinor / CENTS_PER_UNIT;
  const fraction = absoluteMinor % CENTS_PER_UNIT;

  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}
