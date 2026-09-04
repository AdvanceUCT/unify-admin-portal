import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  findIssuances: vi.fn(),
  findIssuance: vi.fn(),
  getUniversityProfile: vi.fn(),
  jobQuery: vi.fn(),
  jobUpdate: vi.fn(),
  jobUpdateMany: vi.fn(),
  jobUpsert: vi.fn(),
  queueRenewal: vi.fn(),
  requestLifecycle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/university/profile", () => ({ getUniversityProfile: mocks.getUniversityProfile }));
vi.mock("@/lib/issuance/batchIssuance", () => ({ queueCredentialIssuanceRenewal: mocks.queueRenewal }));
vi.mock("@/lib/credentials/lifecycleActions", () => ({ requestCredentialLifecycleChange: mocks.requestLifecycle }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.jobQuery,
    credentialAuditLog: { create: mocks.auditCreate },
    credentialAutomationJob: {
      update: mocks.jobUpdate,
      updateMany: mocks.jobUpdateMany,
      upsert: mocks.jobUpsert,
    },
    credentialIssuance: { findMany: mocks.findIssuances, findUnique: mocks.findIssuance },
  },
}));

import { enqueueDueRenewals, runCredentialAutomation } from "@/lib/credentials/automation";

const now = new Date("2026-09-04T22:05:00.000Z");
const issuance = {
  credentialDefinitionId: "cred-def-1",
  credentialExchangeId: "exchange-1",
  id: "issuance-1",
  issuedAt: new Date("2025-09-04T22:05:00.000Z"),
  lifecycleStatus: "ACTIVE",
  studentId: "STU001",
};

describe("credential automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUniversityProfile.mockResolvedValue({
      automaticCredentialRenewalEnabled: true,
      renewalCadenceMonths: 12,
    });
    mocks.findIssuances.mockResolvedValue([issuance]);
    mocks.jobUpsert.mockResolvedValue({});
    mocks.jobUpdate.mockResolvedValue({});
    mocks.findIssuance.mockResolvedValue(issuance);
    mocks.queueRenewal.mockResolvedValue({});
    mocks.requestLifecycle.mockResolvedValue({});
  });

  it("queues each due issuance once with a stable key", async () => {
    await expect(enqueueDueRenewals(now)).resolves.toBe(1);
    expect(mocks.jobUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        credentialIssuanceId: "issuance-1",
        deduplicationKey: "auto-renew:issuance-1",
        dueAt: new Date("2026-09-04T22:05:00.000Z"),
      }),
      where: { deduplicationKey: "auto-renew:issuance-1" },
    }));
  });

  it("cancels pending renewal jobs when automation is disabled", async () => {
    mocks.getUniversityProfile.mockResolvedValue({ automaticCredentialRenewalEnabled: false, renewalCadenceMonths: 12 });
    await expect(enqueueDueRenewals(now)).resolves.toBe(0);
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PENDING", type: "AUTO_RENEW" },
    }));
    expect(mocks.findIssuances).not.toHaveBeenCalled();
  });

  it("executes a claimed renewal with its idempotency key", async () => {
    mocks.findIssuances.mockResolvedValue([]);
    const job = {
      attemptCount: 1,
      credentialIssuanceId: "issuance-1",
      deduplicationKey: "auto-renew:issuance-1",
      dueAt: now,
      id: "job-1",
      requestedByActorId: null,
      type: "AUTO_RENEW",
    };
    mocks.jobQuery.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);

    await expect(runCredentialAutomation(now, 2)).resolves.toMatchObject({ processed: 1, succeeded: 1 });
    expect(mocks.queueRenewal).toHaveBeenCalledWith("issuance-1", now, null, "auto-renew:issuance-1");
    expect(mocks.jobUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }));
  });

  it("defers a suspended renewal without consuming a retry attempt", async () => {
    mocks.findIssuances.mockResolvedValue([]);
    mocks.findIssuance.mockResolvedValue({ ...issuance, lifecycleStatus: "SUSPENDED" });
    const job = {
      attemptCount: 3,
      credentialIssuanceId: "issuance-1",
      deduplicationKey: "auto-renew:issuance-1",
      dueAt: now,
      id: "job-1",
      requestedByActorId: null,
      type: "AUTO_RENEW",
    };
    mocks.jobQuery.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);

    await expect(runCredentialAutomation(now, 2)).resolves.toMatchObject({ deferred: 1, processed: 1 });
    expect(mocks.jobUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ attemptCount: 2, status: "PENDING" }),
    }));
    expect(mocks.queueRenewal).not.toHaveBeenCalled();
  });

  it("marks the fifth failed attempt for manual retry", async () => {
    mocks.findIssuances.mockResolvedValue([]);
    mocks.queueRenewal.mockRejectedValue(new Error("Agent unavailable"));
    const job = {
      attemptCount: 5,
      credentialIssuanceId: "issuance-1",
      deduplicationKey: "auto-renew:issuance-1",
      dueAt: now,
      id: "job-1",
      requestedByActorId: null,
      type: "AUTO_RENEW",
    };
    mocks.jobQuery.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);

    await expect(runCredentialAutomation(now, 2)).resolves.toMatchObject({ failed: 1, processed: 1 });
    expect(mocks.jobUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "Agent unavailable", status: "FAILED" }),
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CREDENTIAL_AUTOMATION_FAILED" }),
    }));
  });

  it("executes a due scheduled reactivation", async () => {
    mocks.findIssuances.mockResolvedValue([]);
    mocks.findIssuance.mockResolvedValue({ ...issuance, lifecycleStatus: "SUSPENDED" });
    const job = {
      attemptCount: 1,
      credentialIssuanceId: "issuance-1",
      deduplicationKey: "auto-reactivate:issuance-1:event-1",
      dueAt: now,
      id: "job-2",
      requestedByActorId: "admin-1",
      type: "AUTO_REACTIVATE",
    };
    mocks.jobQuery.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);

    await expect(runCredentialAutomation(now, 2)).resolves.toMatchObject({ succeeded: 1 });
    expect(mocks.requestLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      action: "reactivate",
      credentialIssuanceId: "issuance-1",
      studentId: "STU001",
    }));
  });
});
