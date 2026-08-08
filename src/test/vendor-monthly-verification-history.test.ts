import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVendorMonthlyVerificationHistory } from "@/lib/vendors/monthlyVerificationHistory";

const database = vi.hoisted(() => ({
  vendorVerification: {
    findMany: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

describe("getVendorMonthlyVerificationHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only approved and verified completed events without filtering out checkout/API sessions", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-08-08T10:00:00.000Z"),
    );

    expect(database.vendorVerification.findMany).toHaveBeenCalledWith({
      where: {
        vendorProfileId: "vendor-profile-1",
        status: "APPROVED",
        isVerified: true,
        completedAt: { not: null },
      },
      select: {
        completedAt: true,
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
      { completedAt: new Date("2026-01-31T22:30:00.000Z") },
      { completedAt: new Date("2026-03-01T08:00:00.000Z") },
      { completedAt: new Date("2026-03-20T08:00:00.000Z") },
    ]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-04-15T10:00:00.000Z"),
    );

    expect(history.currentMonth).toMatchObject({
      month: "2026-04",
      label: "April 2026",
      successfulVerifications: 0,
    });
    expect(history.allTimeSuccessfulVerifications).toBe(3);
    expect(history.months).toEqual([
      {
        month: "2026-04",
        label: "April 2026",
        successfulVerifications: 0,
        isCurrentMonth: true,
      },
      {
        month: "2026-03",
        label: "March 2026",
        successfulVerifications: 2,
        isCurrentMonth: false,
      },
      {
        month: "2026-02",
        label: "February 2026",
        successfulVerifications: 1,
        isCurrentMonth: false,
      },
    ]);
  });

  it("excludes approved rows where isVerified is null through the database filter", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      { completedAt: new Date("2026-08-08T10:00:00.000Z") },
    ]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-08-08T10:00:00.000Z"),
    );

    expect(database.vendorVerification.findMany.mock.calls[0]?.[0].where.isVerified).toBe(
      true,
    );
    expect(history.allTimeSuccessfulVerifications).toBe(1);
  });

  it("returns the current month with zero count when the vendor has no successful verifications", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    const history = await getVendorMonthlyVerificationHistory(
      "vendor-profile-1",
      new Date("2026-08-08T10:00:00.000Z"),
    );

    expect(history.allTimeSuccessfulVerifications).toBe(0);
    expect(history.months).toEqual([
      {
        month: "2026-08",
        label: "August 2026",
        successfulVerifications: 0,
        isCurrentMonth: true,
      },
    ]);
  });
});
