import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  cancel: vi.fn(),
  update: vi.fn(),
  issuance: vi.fn(),
  lifecycle: vi.fn(),
  annual: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/credentials/annualRenewals", () => ({
  runAnnualRenewals: mocks.annual,
}));
vi.mock("@/lib/credentials/lifecycleActions", () => ({
  requestCredentialLifecycleChange: mocks.lifecycle,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.query,
    credentialAutomationJob: { updateMany: mocks.cancel, update: mocks.update },
    credentialIssuance: { findUnique: mocks.issuance },
    credentialAutomationRun: {
      create: mocks.runCreate,
      update: mocks.runUpdate,
    },
    credentialAuditLog: { create: mocks.audit },
  },
}));
import {
  enqueueDueRenewals,
  runCredentialAutomation,
} from "@/lib/credentials/automation";
const now = new Date("2026-10-03T10:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.runCreate.mockResolvedValue({ id: "run" });
  mocks.query.mockResolvedValue([]);
  mocks.annual.mockResolvedValue({
    processed: 2,
    failed: 0,
    cancelled: 0,
    deferred: 0,
    retrying: 0,
    succeeded: 2,
  });
});
describe("credential automation orchestration", () => {
  it("retires global cadence jobs without touching lifecycle jobs", async () => {
    await enqueueDueRenewals(now);
    expect(mocks.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "AUTO_RENEW",
          status: { in: ["PENDING", "PROCESSING"] },
        },
      }),
    );
  });
  it("runs annual renewals and persists scheduler health", async () => {
    expect(await runCredentialAutomation(now)).toMatchObject({
      processed: 2,
      succeeded: 2,
    });
    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED", processed: 2 }),
      }),
    );
  });
  it("keeps scheduled reactivation independent of annual configuration", async () => {
    mocks.issuance.mockResolvedValue({
      id: "old",
      studentId: "student",
      lifecycleStatus: "SUSPENDED",
      lifecycleRevision: 3,
      lifecycleEventId: "event",
    });
    mocks.query
      .mockResolvedValueOnce([
        {
          id: "job",
          credentialIssuanceId: "old",
          type: "AUTO_REACTIVATE",
          attemptCount: 1,
          metadata: { suspensionRevision: 3, suspensionEventId: "event" },
        },
      ])
      .mockResolvedValue([]);
    await runCredentialAutomation(now);
    expect(mocks.lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reactivate",
        expectedLifecycleRevision: 3,
      }),
    );
  });
  it("records scheduler failures durably", async () => {
    mocks.annual.mockRejectedValue(new Error("Database unavailable"));
    await expect(runCredentialAutomation(now)).rejects.toThrow(
      "Database unavailable",
    );
    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "Database unavailable",
        }),
      }),
    );
  });
});
