import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVendorMonthlyVerificationHistory } from "@/lib/vendors/monthlyVerificationHistory";

const database = vi.hoisted(() => ({
  vendorVerification: {
    findMany: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({
  env: {
    VERIFICATION_FEE_CURRENCY: "ZAR",
    VERIFICATION_FEE_MINOR: 125,
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

describe("getVendorMonthlyVerificationHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries approved successful completed events without filtering out checkout/API sessions", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-08-08T10:00:00.000Z"),
    );

    expect(database.vendorVerification.findMany).toHaveBeenCalledWith({
      where: {
        vendorProfileId: "vendor-profile-1",
        status: "APPROVED",
        NOT: { isVerified: false },
        completedAt: { not: null },
      },
      select: {
        billingStatus: true,
        completedAt: true,
        verificationFeeCurrency: true,
        verificationFeeMinor: true,
      },
      orderBy: {
        completedAt: "asc",
      },
    });
    expect(database.vendorVerification.findMany.mock.calls[0]?.[0].where).not.toHaveProperty(
      "checkoutId",
    );
  });

  it("groups successful verifications by completedAt month and fills zero-count months", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      {
        billingStatus: "BILLABLE",
        completedAt: new Date("2026-01-31T22:30:00.000Z"),
        verificationFeeCurrency: "ZAR",
        verificationFeeMinor: 125,
      },
      {
        billingStatus: "BILLABLE",
        completedAt: new Date("2026-03-01T08:00:00.000Z"),
        verificationFeeCurrency: "ZAR",
        verificationFeeMinor: 125,
      },
      {
        billingStatus: "NOT_BILLABLE",
        completedAt: new Date("2026-03-20T08:00:00.000Z"),
        verificationFeeCurrency: "ZAR",
        verificationFeeMinor: 0,
      },
    ]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-04-15T10:00:00.000Z"),
    );

    expect(history.currentMonth).toMatchObject({
      amountDueMinor: 0,
      currency: "ZAR",
      label: "April 2026",
      month: "2026-04",
      rowLabel: "April",
      successfulVerifications: 0,
    });
    expect(history.allTimeSuccessfulVerifications).toBe(3);
    expect(history.availableYears).toEqual([2026]);
    expect(history.selectedYear).toBe(2026);
    expect(history.months).toEqual([
      {
        amountDueMinor: 0,
        currency: "ZAR",
        label: "April 2026",
        isCurrentMonth: true,
        month: "2026-04",
        rowLabel: "April",
        successfulVerifications: 0,
      },
      {
        amountDueMinor: 125,
        currency: "ZAR",
        label: "March 2026",
        isCurrentMonth: false,
        month: "2026-03",
        rowLabel: "March",
        successfulVerifications: 2,
      },
      {
        amountDueMinor: 125,
        currency: "ZAR",
        label: "February 2026",
        isCurrentMonth: false,
        month: "2026-02",
        rowLabel: "February",
        successfulVerifications: 1,
      },
      {
        amountDueMinor: 0,
        currency: "ZAR",
        label: "January 2026",
        isCurrentMonth: false,
        month: "2026-01",
        rowLabel: "January",
        successfulVerifications: 0,
      },
    ]);
  });

  it("filters monthly rows to the selected year and includes months that have started", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      {
        billingStatus: "BILLABLE",
        completedAt: new Date("2025-05-10T08:00:00.000Z"),
        verificationFeeCurrency: "ZAR",
        verificationFeeMinor: 200,
      },
      {
        billingStatus: "BILLABLE",
        completedAt: new Date("2026-02-10T08:00:00.000Z"),
        verificationFeeCurrency: "ZAR",
        verificationFeeMinor: 125,
      },
    ]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      { now: new Date("2026-04-15T10:00:00.000Z"), year: 2025 },
    );

    expect(history.availableYears).toEqual([2026, 2025]);
    expect(history.selectedYear).toBe(2025);
    expect(history.months).toHaveLength(12);
    expect(history.months[0]).toMatchObject({
      amountDueMinor: 0,
      label: "December 2025",
      rowLabel: "December",
      successfulVerifications: 0,
    });
    expect(history.months.find((month) => month.month === "2025-05")).toMatchObject({
      amountDueMinor: 200,
      successfulVerifications: 1,
    });
  });

  it("includes approved rows unless isVerified is explicitly false", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      {
        billingStatus: "BILLABLE",
        completedAt: new Date("2026-08-08T10:00:00.000Z"),
        verificationFeeCurrency: "ZAR",
        verificationFeeMinor: 125,
      },
    ]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-08-08T10:00:00.000Z"),
    );

    expect(database.vendorVerification.findMany.mock.calls[0]?.[0].where.NOT).toEqual({
      isVerified: false,
    });
    expect(history.allTimeSuccessfulVerifications).toBe(1);
    expect(history.currentMonth).toMatchObject({ amountDueMinor: 125 });
  });

  it("returns the current month with zero count when the vendor has no successful verifications", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-08-08T10:00:00.000Z"),
    );

    expect(history.allTimeSuccessfulVerifications).toBe(0);
    expect(history.months).toHaveLength(8);
    expect(history.months[0]).toEqual({
      amountDueMinor: 0,
      currency: "ZAR",
      label: "August 2026",
      isCurrentMonth: true,
      month: "2026-08",
      rowLabel: "August",
      successfulVerifications: 0,
    });
    expect(history.months.at(-1)).toMatchObject({
      label: "January 2026",
      successfulVerifications: 0,
    });
  });
});
