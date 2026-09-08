import { describe, expect, it, vi } from "vitest";

import { VendorVerificationBillingStatus } from "@/generated/prisma/enums";
import {
  billingPeriodKeyFromDate,
  billingPeriodLabel,
  getActiveVerificationPricing,
  resolveVerificationBillingSnapshot,
} from "@/lib/vendors/verificationBilling";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({
  env: {
    VERIFICATION_FEE_CURRENCY: "ZAR",
    VERIFICATION_FEE_MINOR: 125,
  },
}));

describe("vendor verification billing", () => {
  it("uses the active platform pricing from env", () => {
    expect(getActiveVerificationPricing()).toEqual({ currency: "ZAR", feeMinor: 125 });
  });

  it("builds billing period keys using the Johannesburg reporting month", () => {
    expect(billingPeriodKeyFromDate(new Date("2026-01-31T22:30:00.000Z"))).toBe("2026-02");
    expect(billingPeriodLabel("2026-02")).toBe("February 2026");
  });

  it("marks approved verified events as billable", () => {
    const snapshot = resolveVerificationBillingSnapshot({
      completedAt: new Date("2026-08-03T20:02:00.000Z"),
      isVerified: true,
      status: "APPROVED",
    });

    expect(snapshot).toMatchObject({
      billingPeriodKey: "2026-08",
      billingReason: "APPROVED_VERIFICATION",
      billingStatus: VendorVerificationBillingStatus.BILLABLE,
      verificationFeeCurrency: "ZAR",
      verificationFeeMinor: 125,
    });
    expect(snapshot.pricingSnapshotAt).toBeInstanceOf(Date);
  });

  it("treats approved events without an isVerified flag as billable", () => {
    expect(resolveVerificationBillingSnapshot({
      completedAt: new Date("2026-08-03T20:02:00.000Z"),
      isVerified: null,
      status: "APPROVED",
    })).toMatchObject({
      billingReason: "APPROVED_VERIFICATION",
      billingStatus: VendorVerificationBillingStatus.BILLABLE,
      verificationFeeMinor: 125,
    });
  });

  it.each([
    ["DECLINED", false, "DECLINED"],
    ["FAILED", false, "FAILED"],
    ["EXPIRED", false, "EXPIRED"],
    ["APPROVED", false, "NOT_VERIFIED"],
  ] as const)("marks %s events as not billable", (status, isVerified, reason) => {
    expect(resolveVerificationBillingSnapshot({
      completedAt: new Date("2026-08-03T20:02:00.000Z"),
      isVerified,
      status,
    })).toMatchObject({
      billingReason: reason,
      billingStatus: VendorVerificationBillingStatus.NOT_BILLABLE,
      verificationFeeMinor: 0,
    });
  });

  it("leaves pending events pending", () => {
    expect(resolveVerificationBillingSnapshot({ status: "PENDING" })).toMatchObject({
      billingPeriodKey: null,
      billingReason: "PENDING",
      billingStatus: VendorVerificationBillingStatus.PENDING,
      pricingSnapshotAt: null,
      verificationFeeMinor: 0,
    });
  });
});
