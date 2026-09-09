import { beforeEach, describe, expect, it, vi } from "vitest";

import { acquireJobLease, completeJobLease, failJobLease, type JobLeaseClient } from "@/lib/billing/jobLease";

function makeDb() {
  const tx = { billingRun: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() } };
  const billingRun = { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() };
  const db = {
    billingRun,
    $transaction: vi.fn((fn: (transaction: typeof tx) => unknown) => fn(tx)),
  } as unknown as Parameters<typeof acquireJobLease>[0];
  return { db, billingRun, tx };
}

describe("acquireJobLease", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a fresh RUNNING row when none exists", async () => {
    const { db, billingRun } = makeDb();
    billingRun.create.mockResolvedValue({ id: "run-1" });

    const result = await acquireJobLease(db, { jobType: "VENDOR_BILLING_DAILY", leaseOwner: "cron" });

    expect(result).toEqual({ runId: "run-1", cursor: null });
    expect(billingRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobType: "VENDOR_BILLING_DAILY", status: "RUNNING", leaseOwner: "cron" }) }),
    );
  });

  it("refuses to start when another instance holds a live (unexpired) lease", async () => {
    const { db, billingRun, tx } = makeDb();
    const now = new Date("2026-09-13T12:00:00.000Z");
    billingRun.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    tx.billingRun.findFirst.mockResolvedValue({ id: "run-existing", leaseExpiresAt: new Date(now.getTime() + 60_000), cursor: null });

    const result = await acquireJobLease(db, { jobType: "VENDOR_BILLING_DAILY", leaseOwner: "cron-2", now });

    expect(result).toBeNull();
    expect(tx.billingRun.updateMany).not.toHaveBeenCalled();
  });

  it("takes over a stale (expired) lease and preserves its cursor for resumption", async () => {
    const { db, billingRun, tx } = makeDb();
    const now = new Date("2026-09-13T12:00:00.000Z");
    const staleLeaseExpiresAt = new Date(now.getTime() - 60_000);
    billingRun.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    tx.billingRun.findFirst.mockResolvedValue({ id: "run-existing", leaseExpiresAt: staleLeaseExpiresAt, cursor: "charge-123" });
    tx.billingRun.updateMany.mockResolvedValue({ count: 1 });

    const result = await acquireJobLease(db, { jobType: "VENDOR_BILLING_DAILY", leaseOwner: "cron-2", now });

    expect(result).toEqual({ runId: "run-existing", cursor: "charge-123" });
    expect(tx.billingRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "run-existing", status: "RUNNING", leaseExpiresAt: staleLeaseExpiresAt } }),
    );
  });

  it("returns null when it loses a race to take over the same stale row", async () => {
    const { db, billingRun, tx } = makeDb();
    const now = new Date("2026-09-13T12:00:00.000Z");
    billingRun.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    tx.billingRun.findFirst.mockResolvedValue({ id: "run-existing", leaseExpiresAt: new Date(now.getTime() - 1000), cursor: null });
    tx.billingRun.updateMany.mockResolvedValue({ count: 0 });

    const result = await acquireJobLease(db, { jobType: "VENDOR_BILLING_DAILY", leaseOwner: "cron-2", now });

    expect(result).toBeNull();
  });

  it("returns null when the racing job completed between the failed create and the read", async () => {
    const { db, billingRun, tx } = makeDb();
    billingRun.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    tx.billingRun.findFirst.mockResolvedValue(null);

    const result = await acquireJobLease(db, { jobType: "VENDOR_BILLING_DAILY", leaseOwner: "cron-2" });

    expect(result).toBeNull();
  });

  it("rethrows an unrelated error from create()", async () => {
    const { db, billingRun } = makeDb();
    billingRun.create.mockRejectedValue(new Error("connection lost"));

    await expect(acquireJobLease(db, { jobType: "VENDOR_BILLING_DAILY", leaseOwner: "cron" })).rejects.toThrow("connection lost");
  });
});

describe("completeJobLease / failJobLease", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the run COMPLETED with the final counts", async () => {
    const client = { billingRun: { update: vi.fn() } } as unknown as JobLeaseClient & { billingRun: { update: ReturnType<typeof vi.fn> } };

    await completeJobLease(client, "run-1", { scannedCount: 5, importedCount: 3, exceptionCount: 1, cursor: "charge-999" });

    expect(client.billingRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "COMPLETED", scannedCount: 5, importedCount: 3, exceptionCount: 1, cursor: "charge-999" }),
    });
  });

  it("marks the run FAILED with a truncated failure reason", async () => {
    const client = { billingRun: { update: vi.fn() } } as unknown as JobLeaseClient & { billingRun: { update: ReturnType<typeof vi.fn> } };

    await failJobLease(client, "run-1", new Error("provider down"));

    expect(client.billingRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "FAILED", failureReason: "provider down" }),
    });
  });
});
