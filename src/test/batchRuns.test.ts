import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchIssuanceItemStatus, BatchIssuanceRunStatus } from "@/generated/prisma/enums";
import type { StudentRecord } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  batchIssuanceItemUpdate: vi.fn(),
  batchIssuanceRunFindUnique: vi.fn(),
  batchIssuanceRunFindUniqueOrThrow: vi.fn(),
  batchIssuanceRunUpdate: vi.fn(),
  createBatchActivationLinks: vi.fn(),
  findActiveCredentialIssuance: vi.fn(),
  getAllStudents: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  createBatchActivationLinks: mocks.createBatchActivationLinks,
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/credentials/audit", () => ({
  recordCredentialOfferSentAudit: vi.fn(),
}));

vi.mock("@/lib/credentials/status", () => ({
  createCredentialIssuanceFromOffer: vi.fn(),
  findActiveCredentialIssuance: mocks.findActiveCredentialIssuance,
  overlayCredentialStatuses: vi.fn(async (students) => students),
  reconcileCredentialEventLogs: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    batchIssuanceItem: {
      update: mocks.batchIssuanceItemUpdate,
    },
    batchIssuanceRun: {
      findUnique: mocks.batchIssuanceRunFindUnique,
      findUniqueOrThrow: mocks.batchIssuanceRunFindUniqueOrThrow,
      update: mocks.batchIssuanceRunUpdate,
    },
  },
}));

vi.mock("@/lib/email/credential-activation", () => ({
  sendCredentialActivationEmail: vi.fn(),
}));

vi.mock("@/lib/issuance/batchIssuance", () => ({
  attributesForStudent: vi.fn(() => [{ name: "studentNumber", value: "STU001" }]),
  credentialValidityWindowFrom: vi.fn((validFrom: Date) => ({
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    validFrom,
  })),
  getActiveCredentialDefinition: vi.fn(async () => ({
    credentialDefinitionId: "cred-def-1",
    credentialValidityDays: 365,
    schemaAttributes: ["studentNumber"],
    schemaVersion: "1.0",
  })),
  parseBatchIssuanceSelection: vi.fn((selection) => selection ?? {}),
}));

vi.mock("@/lib/students/repository", () => ({
  getAllStudents: mocks.getAllStudents,
}));

vi.mock("@/lib/student-records/simulatedUniversityRecords", () => ({
  selectStudentRecordsForCredentialIssuance: vi.fn(() => []),
  SIMULATED_STUDENT_COHORT_ID: "simulated-2026-cohort",
}));

import { processBatchRun } from "@/lib/issuance/batchRuns";

const student: StudentRecord = {
  credential: {
    expiresAt: "2027-01-01T00:00:00.000Z",
    faculty: "Science",
    holderName: "Test Student",
    id: "credential-1",
    issuer: "Example University",
    lifecycleState: "NOT_ISSUED",
    programme: "Computer Science",
    studentNumber: "STU001",
    validFrom: "2026-01-01T00:00:00.000Z",
  },
  profile: {
    email: "student@example.edu",
    firstName: "Test",
    id: "student-profile-1",
    institution: "Example University",
    lastName: "Student",
  },
};

const pendingItem = {
  id: "item-1",
  credentialIssuance: null,
  credentialIssuanceId: null,
  failureReason: null,
  skipReason: null,
  status: BatchIssuanceItemStatus.PENDING,
  studentId: "STU001",
};

const pendingRun = {
  activatedCount: 0,
  actorId: "admin-1",
  batchId: "batch-1",
  cohortId: "cohort-1",
  completedAt: null,
  createdAt: new Date("2026-04-27T09:00:00.000Z"),
  eligibleCount: 1,
  failedCount: 0,
  filters: {},
  issuedCount: 0,
  items: [pendingItem],
  queuedAt: new Date("2026-04-27T09:00:00.000Z"),
  requestedCount: 1,
  skippedCount: 0,
  startedAt: null,
  status: BatchIssuanceRunStatus.QUEUED,
};

describe("persisted batch runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllStudents.mockResolvedValue([student]);
    mocks.findActiveCredentialIssuance.mockResolvedValue(null);
  });

  it("fails pending items and finalizes the run when the agent batch call times out", async () => {
    const timeoutMessage = "Agent service request timed out after 60000ms.";
    const failedItem = {
      ...pendingItem,
      failureReason: timeoutMessage,
      status: BatchIssuanceItemStatus.FAILED,
    };
    const failedRun = {
      ...pendingRun,
      completedAt: new Date("2026-04-27T09:01:00.000Z"),
      failedCount: 1,
      items: [failedItem],
      status: BatchIssuanceRunStatus.FAILED,
    };

    mocks.batchIssuanceRunFindUnique.mockResolvedValueOnce(pendingRun);
    mocks.createBatchActivationLinks.mockRejectedValueOnce(new Error(timeoutMessage));
    mocks.batchIssuanceItemUpdate.mockResolvedValueOnce(failedItem);
    mocks.batchIssuanceRunFindUniqueOrThrow.mockResolvedValueOnce({
      ...pendingRun,
      items: [failedItem],
    });
    mocks.batchIssuanceRunUpdate
      .mockResolvedValueOnce({ ...pendingRun, status: BatchIssuanceRunStatus.PROCESSING })
      .mockResolvedValueOnce(failedRun);

    const result = await processBatchRun("batch-1");

    expect(mocks.batchIssuanceRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BatchIssuanceRunStatus.PROCESSING }),
        where: { batchId: "batch-1" },
      }),
    );
    expect(mocks.batchIssuanceItemUpdate).toHaveBeenCalledWith({
      data: {
        failureReason: timeoutMessage,
        status: BatchIssuanceItemStatus.FAILED,
      },
      where: { id: "item-1" },
    });
    expect(mocks.batchIssuanceRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedCount: 1,
          issuedCount: 0,
          status: BatchIssuanceRunStatus.FAILED,
        }),
        where: { batchId: "batch-1" },
      }),
    );
    expect(result.status).toBe("Failed");
    expect(result.items[0]).toMatchObject({
      failureReason: timeoutMessage,
      status: "Failed",
      studentId: "STU001",
    });
  });
});
