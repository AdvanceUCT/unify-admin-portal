import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VendorVerificationBillingStatus } from "@/generated/prisma/enums";
import { finalizeVerificationCharge, type ChargeClient } from "@/lib/billing/charges";

const database = vi.hoisted(() => ({
  verificationCharge: { findUnique: vi.fn(), create: vi.fn() },
  verificationBillingPolicy: { findFirst: vi.fn() },
  universityProfile: { findMany: vi.fn() },
  billingException: { upsert: vi.fn() },
}));
const client = database as unknown as ChargeClient;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

const baseInput = {
  verificationId: "verification-001",
  vendorProfileId: "vendor-001",
  branchId: "branch-001",
  branchNameSnapshot: "Main Branch",
  billingStatus: "BILLABLE" as const,
  verificationFeeMinor: 250,
  verificationFeeCurrency: "ZAR",
  billingPeriodKey: "2026-09",
  completedAt: new Date("2026-09-05T10:00:00.000Z"),
};

describe("finalizeVerificationCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.verificationCharge.findUnique.mockResolvedValue(null);
    database.universityProfile.findMany.mockResolvedValue([{ id: "university-001" }]);
    database.verificationBillingPolicy.findFirst.mockResolvedValue({ id: "policy-001", platformBasisPoints: 1000 });
  });

  it("creates a charge with shares split by the effective policy", async () => {
    database.verificationCharge.create.mockResolvedValue({ id: "charge-001" });

    const result = await finalizeVerificationCharge(client, baseInput);

    expect(database.verificationCharge.create).toHaveBeenCalledWith({
      data: {
        verificationId: "verification-001",
        vendorProfileId: "vendor-001",
        branchId: "branch-001",
        branchNameSnapshot: "Main Branch",
        servicePeriodKey: "2026-09",
        serviceCompletedAt: baseInput.completedAt,
        feeMinor: BigInt(250),
        currency: "ZAR",
        platformShareMinor: BigInt(25),
        universityShareMinor: BigInt(225),
        policyId: "policy-001",
        source: "LIVE",
      },
    });
    expect(result).toEqual({ id: "charge-001" });
  });

  it("does nothing for a not-yet-billable verification", async () => {
    await finalizeVerificationCharge(client, {
      ...baseInput,
      billingStatus: "PENDING" satisfies VendorVerificationBillingStatus,
    });

    expect(database.verificationCharge.create).not.toHaveBeenCalled();
    expect(database.universityProfile.findMany).not.toHaveBeenCalled();
  });

  it("does nothing when completedAt or billingPeriodKey is missing even if marked billable", async () => {
    await finalizeVerificationCharge(client, { ...baseInput, completedAt: null });
    await finalizeVerificationCharge(client, { ...baseInput, billingPeriodKey: null });

    expect(database.verificationCharge.create).not.toHaveBeenCalled();
  });

  it("is idempotent: returns the existing charge without creating a second one", async () => {
    const existingCharge = { id: "charge-001", feeMinor: BigInt(250), currency: "ZAR" };
    database.verificationCharge.findUnique.mockResolvedValue(existingCharge);

    const result = await finalizeVerificationCharge(client, baseInput);

    expect(result).toBe(existingCharge);
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
    expect(database.billingException.upsert).not.toHaveBeenCalled();
  });

  it("records a deduplicated correction exception when a charged verification is no longer billable", async () => {
    const existingCharge = { id: "charge-001", feeMinor: BigInt(250), currency: "ZAR" };
    database.verificationCharge.findUnique.mockResolvedValue(existingCharge);

    const result = await finalizeVerificationCharge(client, {
      ...baseInput,
      billingStatus: "NOT_BILLABLE" satisfies VendorVerificationBillingStatus,
    });

    expect(result).toBe(existingCharge);
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "charge-correction:verification-001" },
        create: expect.objectContaining({ type: "CHARGE_BILLABILITY_CORRECTION", chargeId: "charge-001" }),
      }),
    );
  });

  it("records a correction exception when the current fee contradicts the charged fee", async () => {
    const existingCharge = { id: "charge-001", feeMinor: BigInt(250), currency: "ZAR" };
    database.verificationCharge.findUnique.mockResolvedValue(existingCharge);

    await finalizeVerificationCharge(client, { ...baseInput, verificationFeeMinor: 999 });

    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: "CHARGE_BILLABILITY_CORRECTION" }) }),
    );
  });

  it("never re-raises a correction exception for an unchanged already-charged verification", async () => {
    const existingCharge = { id: "charge-001", feeMinor: BigInt(250), currency: "ZAR" };
    database.verificationCharge.findUnique.mockResolvedValue(existingCharge);

    await finalizeVerificationCharge(client, baseInput);

    expect(database.billingException.upsert).not.toHaveBeenCalled();
  });

  it("records a MISSING_BILLING_POLICY exception and does not create a charge when no policy covers completedAt", async () => {
    database.verificationBillingPolicy.findFirst.mockResolvedValue(null);

    const result = await finalizeVerificationCharge(client, baseInput);

    expect(result).toBeNull();
    expect(database.verificationCharge.create).not.toHaveBeenCalled();
    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "missing-policy:verification-001" },
        create: expect.objectContaining({ type: "MISSING_BILLING_POLICY" }),
      }),
    );
  });

  it("resolves a concurrent unique-constraint race by returning the winning charge", async () => {
    const winner = { id: "charge-001" };
    database.verificationCharge.create.mockRejectedValue({ code: "P2002" });
    database.verificationCharge.findUnique
      .mockResolvedValueOnce(null) // first check: no existing charge yet
      .mockResolvedValueOnce(winner); // re-check after the unique violation

    const result = await finalizeVerificationCharge(client, baseInput);

    expect(result).toBe(winner);
  });

  it("never throws — swallows an unexpected error and records a CHARGE_FINALIZATION_FAILED exception", async () => {
    database.verificationCharge.create.mockRejectedValue(new Error("connection reset"));

    const result = await finalizeVerificationCharge(client, baseInput);

    expect(result).toBeNull();
    expect(database.billingException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "finalize-failed:verification-001" },
        create: expect.objectContaining({ type: "CHARGE_FINALIZATION_FAILED" }),
      }),
    );
  });

  it("never throws even when recording the exception itself fails", async () => {
    database.verificationCharge.create.mockRejectedValue(new Error("connection reset"));
    database.billingException.upsert.mockRejectedValue(new Error("also down"));

    await expect(finalizeVerificationCharge(client, baseInput)).resolves.toBeNull();
  });
});
