import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => ({
  billingRun: { findFirst: vi.fn() },
  verificationCharge: { count: vi.fn() },
  vendorInvoicePaymentAttempt: { count: vi.fn(), findFirst: vi.fn() },
  billingGatewayEvent: { count: vi.fn() },
  billingException: { count: vi.fn() },
  vendorInvoice: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

import { getBillingOperationsSummary } from "@/lib/billing/operationsSummary";

describe("getBillingOperationsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.billingRun.findFirst.mockResolvedValue(null);
    database.verificationCharge.count.mockResolvedValue(0);
    database.vendorInvoicePaymentAttempt.count.mockResolvedValue(0);
    database.vendorInvoicePaymentAttempt.findFirst.mockResolvedValue(null);
    database.billingGatewayEvent.count.mockResolvedValue(0);
    database.billingException.count.mockResolvedValue(0);
    database.vendorInvoice.findMany.mockResolvedValue([]);
  });

  it("reports zeros and 'Never run' jobs when nothing has happened yet", async () => {
    const summary = await getBillingOperationsSummary();

    expect(summary.jobRuns).toEqual([
      { jobType: "VENDOR_BILLING_DAILY", lastRunStatus: null, lastRunAtIso: null },
      { jobType: "VENDOR_BILLING_RECONCILE", lastRunStatus: null, lastRunAtIso: null },
      { jobType: "VERIFICATION_CHARGE_BACKFILL", lastRunStatus: null, lastRunAtIso: null },
    ]);
    expect(summary.unclaimedChargeCount).toBe(0);
    expect(summary.pendingAttemptCount).toBe(0);
    expect(summary.oldestPendingAttemptAgeSeconds).toBeNull();
    expect(summary.collectedTotalDisplay).toBe("0.00");
    expect(summary.settlementNote).toBe("Not applicable — test mode");
  });

  it("computes the oldest pending attempt's age in seconds", async () => {
    const now = new Date("2026-09-13T12:10:00.000Z");
    database.vendorInvoicePaymentAttempt.count.mockResolvedValue(2);
    database.vendorInvoicePaymentAttempt.findFirst.mockResolvedValue({ createdAt: new Date("2026-09-13T12:00:00.000Z") });

    const summary = await getBillingOperationsSummary(now);

    expect(summary.pendingAttemptCount).toBe(2);
    expect(summary.oldestPendingAttemptAgeSeconds).toBe(600);
  });

  it("sums PAID invoice totals as the collected amount", async () => {
    database.vendorInvoice.findMany.mockResolvedValue([{ totalMinor: BigInt(1000), currency: "ZAR" }, { totalMinor: BigInt(250), currency: "ZAR" }]);

    const summary = await getBillingOperationsSummary();

    expect(summary.collectedTotalDisplay).toBe("12.50");
    expect(database.vendorInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { paymentStatus: "PAID" } }));
  });

  it("reports the last completed run's status and timestamp per job type", async () => {
    database.billingRun.findFirst
      .mockResolvedValueOnce({ status: "COMPLETED", startedAt: new Date("2026-09-13T00:00:00.000Z"), completedAt: new Date("2026-09-13T00:05:00.000Z") })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: "FAILED", startedAt: new Date("2026-09-12T00:00:00.000Z"), completedAt: new Date("2026-09-12T00:01:00.000Z") });

    const summary = await getBillingOperationsSummary();

    expect(summary.jobRuns[0]).toEqual({ jobType: "VENDOR_BILLING_DAILY", lastRunStatus: "COMPLETED", lastRunAtIso: "2026-09-13T00:05:00.000Z" });
    expect(summary.jobRuns[1]).toEqual({ jobType: "VENDOR_BILLING_RECONCILE", lastRunStatus: null, lastRunAtIso: null });
    expect(summary.jobRuns[2]).toEqual({ jobType: "VERIFICATION_CHARGE_BACKFILL", lastRunStatus: "FAILED", lastRunAtIso: "2026-09-12T00:01:00.000Z" });
  });

  it("counts unresolved PAYMENT_EXCESS and PAYMENT_SPLIT_MISMATCH exceptions separately", async () => {
    database.billingException.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const summary = await getBillingOperationsSummary();

    expect(summary.duplicatePaymentExceptionCount).toBe(3);
    expect(summary.splitExceptionCount).toBe(1);
    expect(database.billingException.count).toHaveBeenCalledWith({ where: { type: "PAYMENT_EXCESS", resolved: false } });
    expect(database.billingException.count).toHaveBeenCalledWith({ where: { type: "PAYMENT_SPLIT_MISMATCH", resolved: false } });
  });
});
