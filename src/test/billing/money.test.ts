import { describe, expect, it } from "vitest";

import { BillingDomainError } from "@/lib/billing/errors";
import {
  assertSupportedCurrency,
  computeVerificationShares,
  minorToDecimalString,
  parsePercentageToBasisPoints,
  serializeMinor,
} from "@/lib/billing/money";

describe("computeVerificationShares", () => {
  it("splits an evenly divisible fee with no rounding needed", () => {
    expect(computeVerificationShares(BigInt(250), 1000)).toEqual({
      platformMinor: BigInt(25),
      universityMinor: BigInt(225),
    });
  });

  it("rounds an exact half up to the platform share", () => {
    // 2 * 25% = 0.5 exactly -> half-up rounds the platform share up to 1.
    expect(computeVerificationShares(BigInt(2), 2500)).toEqual({
      platformMinor: BigInt(1),
      universityMinor: BigInt(1),
    });
  });

  it("rounds a fraction below one half down", () => {
    // 1000 * 0.01% = 0.1 -> rounds down to 0.
    expect(computeVerificationShares(BigInt(1000), 1)).toEqual({
      platformMinor: BigInt(0),
      universityMinor: BigInt(1000),
    });
  });

  it("gives the platform nothing at 0 bps and everything at 10000 bps", () => {
    expect(computeVerificationShares(BigInt(500), 0)).toEqual({
      platformMinor: BigInt(0),
      universityMinor: BigInt(500),
    });
    expect(computeVerificationShares(BigInt(500), 10_000)).toEqual({
      platformMinor: BigInt(500),
      universityMinor: BigInt(0),
    });
  });

  it("handles a zero fee", () => {
    expect(computeVerificationShares(BigInt(0), 1000)).toEqual({
      platformMinor: BigInt(0),
      universityMinor: BigInt(0),
    });
  });

  it("rejects a negative fee", () => {
    expect(() => computeVerificationShares(BigInt(-1), 1000)).toThrow(BillingDomainError);
  });

  it("rejects an out-of-range basis point value", () => {
    expect(() => computeVerificationShares(BigInt(100), -1)).toThrow(BillingDomainError);
    expect(() => computeVerificationShares(BigInt(100), 10_001)).toThrow(BillingDomainError);
  });

  it("rejects a non-integer basis point value", () => {
    expect(() => computeVerificationShares(BigInt(100), 10.5)).toThrow(BillingDomainError);
  });
});

describe("parsePercentageToBasisPoints", () => {
  it.each([
    ["0", 0],
    ["10", 1000],
    ["10.5", 1050],
    ["10.00", 1000],
    ["100", 10_000],
    ["100.00", 10_000],
    ["0.01", 1],
  ])("parses %s as %i basis points", (input, expected) => {
    expect(parsePercentageToBasisPoints(input)).toBe(expected);
  });

  it("rejects more than two decimal places", () => {
    expect(() => parsePercentageToBasisPoints("10.555")).toThrow(BillingDomainError);
  });

  it("rejects a negative percentage", () => {
    expect(() => parsePercentageToBasisPoints("-5")).toThrow(BillingDomainError);
  });

  it("rejects a percentage over 100", () => {
    expect(() => parsePercentageToBasisPoints("100.01")).toThrow(BillingDomainError);
  });

  it("rejects non-numeric input", () => {
    expect(() => parsePercentageToBasisPoints("ten percent")).toThrow(BillingDomainError);
  });
});

describe("assertSupportedCurrency", () => {
  it("accepts ZAR", () => {
    expect(() => assertSupportedCurrency("ZAR")).not.toThrow();
  });

  it("rejects any other currency", () => {
    expect(() => assertSupportedCurrency("USD")).toThrow(BillingDomainError);
  });
});

describe("serializeMinor", () => {
  it("renders an exact integer string, never a rounded float", () => {
    expect(serializeMinor(BigInt(12_345))).toBe("12345");
    expect(serializeMinor(BigInt(0))).toBe("0");
  });
});

describe("minorToDecimalString", () => {
  it("formats whole and fractional cents", () => {
    expect(minorToDecimalString(BigInt(12_345), "ZAR")).toBe("123.45");
    expect(minorToDecimalString(BigInt(0), "ZAR")).toBe("0.00");
    expect(minorToDecimalString(BigInt(5), "ZAR")).toBe("0.05");
  });

  it("formats a negative amount with a single leading minus sign", () => {
    expect(minorToDecimalString(BigInt(-150), "ZAR")).toBe("-1.50");
  });

  it("rejects an unsupported currency", () => {
    expect(() => minorToDecimalString(BigInt(100), "USD")).toThrow(BillingDomainError);
  });
});
