import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/billing/jobLease", () => ({ acquireJobLease: vi.fn(), completeJobLease: vi.fn(), failJobLease: vi.fn() }));
vi.mock("@/lib/billing/reconciliation", () => ({ runVendorBillingReconciliation: vi.fn() }));
vi.mock("@/lib/billing/operationsSummary", () => ({ getBillingOperationsSummary: vi.fn() }));

// Unrelated deps this actions module also imports — stubbed so importing it doesn't pull in unrelated env/db validation.
vi.mock("@/lib/agentClient", () => ({ checkAgentHealth: vi.fn() }));
vi.mock("@/lib/credentials/renewalPolicy", () => ({ countCredentialsDueForRenewal: vi.fn() }));
vi.mock("@/lib/images/logoValidation", () => ({ validateLogoFile: vi.fn() }));
vi.mock("@/lib/storage/supabase", () => ({ deleteVendorDocument: vi.fn(), uploadUniversityLogo: vi.fn() }));
vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
  removeUniversityProfileLogo: vi.fn(),
  saveUniversityProfileLogoPath: vi.fn(),
  updateUniversityProfile: vi.fn(),
}));

import { requireRole } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/audit";
import { acquireJobLease, completeJobLease, failJobLease } from "@/lib/billing/jobLease";
import { runVendorBillingReconciliation } from "@/lib/billing/reconciliation";
import { getBillingOperationsSummary } from "@/lib/billing/operationsSummary";
import { getBillingOperationsSummaryAction, runBillingReconciliationNowAction } from "@/app/(admin)/settings/actions";

const adminSession = { user: { id: "admin-1", role: "ADMIN" } } as Awaited<ReturnType<typeof requireRole>>;
const SUMMARY = {
  jobRuns: [],
  unclaimedChargeCount: 0,
  pendingAttemptCount: 0,
  oldestPendingAttemptAgeSeconds: null,
  webhookFailureCount: 0,
  duplicatePaymentExceptionCount: 0,
  splitExceptionCount: 0,
  collectedTotalDisplay: "0.00",
  settlementNote: "Not applicable — test mode" as const,
};

describe("getBillingOperationsSummaryAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires SUPER_ADMIN/ADMIN", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

    await expect(getBillingOperationsSummaryAction()).rejects.toThrow("Forbidden");
    expect(getBillingOperationsSummary).not.toHaveBeenCalled();
  });

  it("returns the current summary", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(getBillingOperationsSummary).mockResolvedValue(SUMMARY);

    await expect(getBillingOperationsSummaryAction()).resolves.toEqual(SUMMARY);
  });
});

describe("runBillingReconciliationNowAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires SUPER_ADMIN/ADMIN", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

    await expect(runBillingReconciliationNowAction()).rejects.toThrow("Forbidden");
    expect(acquireJobLease).not.toHaveBeenCalled();
  });

  it("throws instead of double-running when the lease is already held (by cron or another admin)", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(acquireJobLease).mockResolvedValue(null);

    await expect(runBillingReconciliationNowAction()).rejects.toThrow(/already in progress/i);
    expect(runVendorBillingReconciliation).not.toHaveBeenCalled();
  });

  it("runs reconciliation, completes the lease, writes an audit log, and returns the refreshed summary", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(acquireJobLease).mockResolvedValue({ runId: "run-1", cursor: null });
    vi.mocked(runVendorBillingReconciliation).mockResolvedValue({
      configured: true,
      attemptsSwept: 2,
      attemptsConfirmed: 1,
      attemptsStillUnresolved: 1,
      gatewayEventsRetried: 0,
      gatewayEventsRecovered: 0,
      gatewayEventsStillFailing: 0,
    });
    vi.mocked(getBillingOperationsSummary).mockResolvedValue(SUMMARY);

    const result = await runBillingReconciliationNowAction();

    expect(completeJobLease).toHaveBeenCalledWith({}, "run-1", expect.any(Object));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "INVOICE_PAYMENT_RECONCILED", actorId: "admin-1" }));
    expect(result).toEqual(SUMMARY);
  });

  it("fails the lease and rethrows on an unexpected error, without writing a success audit log", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(acquireJobLease).mockResolvedValue({ runId: "run-1", cursor: null });
    vi.mocked(runVendorBillingReconciliation).mockRejectedValue(new Error("provider down"));

    await expect(runBillingReconciliationNowAction()).rejects.toThrow("provider down");
    expect(failJobLease).toHaveBeenCalledWith({}, "run-1", expect.any(Error));
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});
