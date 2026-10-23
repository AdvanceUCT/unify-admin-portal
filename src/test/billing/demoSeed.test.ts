import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ env: { VERIFICATION_FEE_CURRENCY: "ZAR", VERIFICATION_FEE_MINOR: 125 } }));

import {
  clampSeedCount,
  clampSeedMonthsBack,
  normalizeSeedPeriodKeys,
  seedMonthOptions,
  seedVerificationHistoryForVendor,
  type DemoSeedClient,
} from "@/lib/billing/demoSeed";
import { billingPeriodKeyFromDate } from "@/lib/vendors/verificationBilling";

const NOW = new Date("2026-10-23T10:00:00.000Z");

describe("seedMonthOptions", () => {
  it("lists the current month back to January, newest first", () => {
    const options = seedMonthOptions(NOW);

    expect(options.map((option) => option.periodKey)).toEqual([
      "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01",
    ]);
    expect(options[0].label).toBe("October 2026");
  });

  it("offers only January in January", () => {
    expect(seedMonthOptions(new Date("2026-01-10T10:00:00.000Z")).map((option) => option.periodKey)).toEqual(["2026-01"]);
  });
});

describe("normalizeSeedPeriodKeys", () => {
  it("de-duplicates and sorts oldest first", () => {
    expect(normalizeSeedPeriodKeys(["2026-09", "2026-07", "2026-09"], NOW)).toEqual(["2026-07", "2026-09"]);
  });

  it("rejects an empty selection, malformed keys and future months", () => {
    expect(() => normalizeSeedPeriodKeys([], NOW)).toThrow(/at least one month/);
    expect(() => normalizeSeedPeriodKeys(["2026-13"], NOW)).toThrow(/2026-13/);
    expect(() => normalizeSeedPeriodKeys(["2026-11"], NOW)).toThrow(/2026-11/);
  });
});

describe("clampSeedCount", () => {
  it("falls back to the default for a non-positive or non-integer input", () => {
    expect(clampSeedCount(0)).toBe(12);
    expect(clampSeedCount(-5)).toBe(12);
    expect(clampSeedCount(1.5)).toBe(12);
  });

  it("caps an oversized count instead of allowing unbounded bulk creation", () => {
    expect(clampSeedCount(10_000)).toBe(50);
  });

  it("passes a normal value through unchanged", () => {
    expect(clampSeedCount(15)).toBe(15);
  });
});

describe("clampSeedMonthsBack", () => {
  it("falls back to the default for a non-positive input", () => {
    expect(clampSeedMonthsBack(0)).toBe(3);
  });

  it("caps an oversized months-back value", () => {
    expect(clampSeedMonthsBack(999)).toBe(24);
  });
});

describe("seedVerificationHistoryForVendor", () => {
  function makeClient(branches: Array<{ id: string; name: string }> = []) {
    const client = {
      vendorBranch: { findMany: vi.fn().mockResolvedValue(branches) },
      vendorVerification: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as DemoSeedClient & { vendorBranch: { findMany: ReturnType<typeof vi.fn> }; vendorVerification: { create: ReturnType<typeof vi.fn> } };
    return client;
  }

  beforeEach(() => vi.clearAllMocks());

  it("creates exactly `count` verifications scoped to the given vendor only", async () => {
    const client = makeClient();

    const created = await seedVerificationHistoryForVendor(client, { vendorProfileId: "vendor-001", count: 5 });

    expect(created).toBe(5);
    expect(client.vendorVerification.create).toHaveBeenCalledTimes(5);
    for (const call of client.vendorVerification.create.mock.calls) {
      expect(call[0].data.vendorProfileId).toBe("vendor-001");
    }
  });

  it("only queries branches for the given vendor, and assigns one to each created verification", async () => {
    const client = makeClient([{ id: "branch-1", name: "Main Branch" }]);

    await seedVerificationHistoryForVendor(client, { vendorProfileId: "vendor-001", count: 3 });

    expect(client.vendorBranch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendorProfileId: "vendor-001", active: true } }),
    );
    for (const call of client.vendorVerification.create.mock.calls) {
      expect(call[0].data.branchId).toBe("branch-1");
    }
  });

  it("creates verifications with no branch when the vendor has none", async () => {
    const client = makeClient([]);

    await seedVerificationHistoryForVendor(client, { vendorProfileId: "vendor-001", count: 1 });

    expect(client.vendorVerification.create.mock.calls[0][0].data.branchId).toBeNull();
  });

  it("marks every created verification APPROVED, verified, and billable, ready for backfill", async () => {
    const client = makeClient();

    await seedVerificationHistoryForVendor(client, { vendorProfileId: "vendor-001", count: 1 });

    const data = client.vendorVerification.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "APPROVED", isVerified: true, billingStatus: "BILLABLE" });
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("spreads verifications round-robin across exactly the chosen months, never after now", async () => {
    const client = makeClient();

    await seedVerificationHistoryForVendor(client, {
      vendorProfileId: "vendor-001",
      count: 6,
      periodKeys: ["2026-10", "2026-07"],
      now: NOW,
    });

    const completedAt = client.vendorVerification.create.mock.calls.map(([args]) => args.data.completedAt as Date);
    expect(completedAt.map(billingPeriodKeyFromDate).sort()).toEqual([
      "2026-07", "2026-07", "2026-07", "2026-10", "2026-10", "2026-10",
    ]);
    for (const date of completedAt) expect(date.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it("uses default count/monthsBack when omitted", async () => {
    const client = makeClient();

    const created = await seedVerificationHistoryForVendor(client, { vendorProfileId: "vendor-001" });

    expect(created).toBe(12);
  });
});
