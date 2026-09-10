import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  runVerificationBillingBackfill,
  type BackfillClient,
} from "@/lib/billing/backfill";

const database = vi.hoisted(() => ({
  vendorVerification: { findMany: vi.fn(), update: vi.fn() },
  verificationCharge: { create: vi.fn() },
  verificationBillingPolicy: { findFirst: vi.fn() },
  universityProfile: { findMany: vi.fn() },
  billingException: { upsert: vi.fn() },
}));
const client = database as unknown as BackfillClient;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

function verification(overrides: Record<string, unknown> = {}) {
  return {
    id: "verification-001",
    vendorProfileId: "vendor-001",
    branchId: "branch-001",
    branch: { name: "Main Branch" },
    servicePointName: "Main Branch",
    status: "APPROVED",
    isVerified: true,
    billingStatus: "BILLABLE",
    verificationFeeMinor: 250,
    verificationFeeCurrency: "ZAR",
    billingPeriodKey: "2026-08",
    completedAt: new Date("2026-08-03T20:02:00.000Z"),
    charge: null,
    ...overrides,
  };
}

describe("runVerificationBillingBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.universityProfile.findMany.mockResolvedValue([
      { id: "university-001" },
    ]);
    database.verificationBillingPolicy.findFirst.mockResolvedValue({
      id: "policy-001",
      platformBasisPoints: 1000,
      verificationFeeMinor: BigInt(125),
      currency: "ZAR",
    });
  });

  it("scans and reports without writing in dry-run mode", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification()]);

    const summary = await runVerificationBillingBackfill(client);

    expect(summary).toMatchObject({
      scanned: 1,
      imported: 1,
      alreadyImported: 0,
      notBillable: 0,
      pending: 0,
      exceptions: 0,
      nextCursor: null,
    });
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
  });

  it("creates a charge sourced as EXISTING_SNAPSHOT in apply mode, preserving the stored fee", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification()]);
    database.verificationCharge.create.mockResolvedValue({ id: "charge-001" });

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary.imported).toBe(1);
    expect(database.verificationCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verificationId: "verification-001",
        feeMinor: BigInt(250),
        currency: "ZAR",
        platformShareMinor: BigInt(25),
        universityShareMinor: BigInt(225),
        source: "EXISTING_SNAPSHOT",
        branchNameSnapshot: "Main Branch",
      }),
    });
  });

  it("counts rows that already have a charge without recreating one", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({ charge: { id: "charge-existing" } }),
    ]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toMatchObject({
      scanned: 1,
      imported: 0,
      alreadyImported: 1,
    });
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
  });

  it("counts pending and not-billable rows separately without creating charges", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({
        id: "v-pending",
        status: "PENDING",
        billingStatus: "PENDING",
        completedAt: null,
        billingPeriodKey: null,
      }),
      verification({ id: "v-not-billable", billingStatus: "NOT_BILLABLE" }),
    ]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toMatchObject({
      scanned: 2,
      pending: 1,
      notBillable: 1,
      imported: 0,
      exceptions: 0,
    });
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
  });

  it("reconstructs a terminal legacy approval from the effective legacy policy", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({
        billingStatus: "PENDING",
        verificationFeeMinor: 0,
        billingPeriodKey: null,
        pricingSnapshotAt: null,
      }),
    ]);
    database.verificationCharge.create.mockResolvedValue({
      id: "charge-legacy",
    });

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toMatchObject({ imported: 1, pending: 0, exceptions: 0 });
    expect(database.vendorVerification.update).toHaveBeenCalledWith({
      where: { id: "verification-001" },
      data: expect.objectContaining({
        billingStatus: "BILLABLE",
        verificationFeeMinor: 125,
        verificationFeeCurrency: "ZAR",
        billingPeriodKey: "2026-08",
        billingReason: "LEGACY_APPROVED_VERIFICATION",
      }),
    });
    expect(database.verificationCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feeMinor: BigInt(125),
        platformShareMinor: BigInt(13),
        universityShareMinor: BigInt(112),
        source: "LEGACY_DEMO_BACKFILL",
      }),
    });
  });

  it("classifies a completed legacy decline as not billable", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({
        billingStatus: "PENDING",
        status: "DECLINED",
        billingPeriodKey: null,
      }),
    ]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toMatchObject({
      imported: 0,
      notBillable: 1,
      pending: 0,
      exceptions: 0,
    });
    expect(database.vendorVerification.update).toHaveBeenCalledWith({
      where: { id: "verification-001" },
      data: expect.objectContaining({
        billingStatus: "NOT_BILLABLE",
        verificationFeeMinor: 0,
        billingPeriodKey: "2026-08",
        billingReason: "DECLINED",
      }),
    });
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
  });

  it("records a terminal legacy row without completedAt as an exception", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({
        billingStatus: "PENDING",
        completedAt: null,
        billingPeriodKey: null,
      }),
    ]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toMatchObject({ imported: 0, pending: 0, exceptions: 1 });
    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "backfill-missing-snapshot:verification-001" },
      }),
    );
  });

  it("records a BACKFILL_MISSING_SNAPSHOT exception for a billable row missing completedAt", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({ completedAt: null }),
    ]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary.exceptions).toBe(1);
    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "backfill-missing-snapshot:verification-001" },
        create: expect.objectContaining({ type: "BACKFILL_MISSING_SNAPSHOT" }),
      }),
    );
  });

  it("does not record an exception in dry-run mode, only counts it", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({ completedAt: null }),
    ]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: false,
    });

    expect(summary.exceptions).toBe(1);
    expect(database.billingException.upsert).not.toHaveBeenCalled();
  });

  it("records a BACKFILL_MISSING_POLICY exception when no policy covers completedAt", async () => {
    database.verificationBillingPolicy.findFirst.mockResolvedValue(null);
    database.vendorVerification.findMany.mockResolvedValue([verification()]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary.exceptions).toBe(1);
    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "backfill-missing-policy:verification-001" },
        create: expect.objectContaining({ type: "BACKFILL_MISSING_POLICY" }),
      }),
    );
  });

  it("falls back to 'Unattributed branch' when neither the branch nor servicePointName is available", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({ branch: null, servicePointName: null }),
    ]);
    database.verificationCharge.create.mockResolvedValue({ id: "charge-001" });

    await runVerificationBillingBackfill(client, { apply: true });

    expect(database.verificationCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchNameSnapshot: "Unattributed branch",
      }),
    });
  });

  it("sets nextCursor to the last row's id only when the batch is full", async () => {
    database.vendorVerification.findMany.mockResolvedValue([
      verification({ id: "v-1" }),
      verification({ id: "v-2" }),
    ]);

    const fullBatch = await runVerificationBillingBackfill(client, {
      batchSize: 2,
    });
    expect(fullBatch.nextCursor).toBe("v-2");

    const partialBatch = await runVerificationBillingBackfill(client, {
      batchSize: 5,
    });
    expect(partialBatch.nextCursor).toBeNull();
  });

  it("passes the cursor through as an exclusive id filter", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    await runVerificationBillingBackfill(client, { cursor: "v-2" });

    expect(database.vendorVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { gt: "v-2" } }),
      }),
    );
  });

  it("scopes the scan to one vendor when vendorProfileId is given, so it can never touch another vendor's rows", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    await runVerificationBillingBackfill(client, { vendorProfileId: "vendor-001" });

    expect(database.vendorVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vendorProfileId: "vendor-001" }),
      }),
    );
  });

  it("does not filter by vendorProfileId at all when omitted (the global CLI/cron scan)", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    await runVerificationBillingBackfill(client, {});

    const where = database.vendorVerification.findMany.mock.calls.at(-1)![0].where;
    expect(where).not.toHaveProperty("vendorProfileId");
  });

  it("treats a concurrent unique-constraint violation as already-imported instead of failing", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification()]);
    database.verificationCharge.create.mockRejectedValue({ code: "P2002" });

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toMatchObject({ imported: 0, alreadyImported: 1 });
  });

  it("returns a zeroed summary without querying policy state when nothing matches", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);

    const summary = await runVerificationBillingBackfill(client, {
      apply: true,
    });

    expect(summary).toEqual({
      scanned: 0,
      imported: 0,
      alreadyImported: 0,
      notBillable: 0,
      pending: 0,
      exceptions: 0,
      nextCursor: null,
    });
    expect(database.universityProfile.findMany).not.toHaveBeenCalled();
  });
});
