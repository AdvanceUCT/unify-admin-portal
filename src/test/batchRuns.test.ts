import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchIssuanceItemStatus, BatchIssuanceRunStatus } from "@/generated/prisma/enums";
import type { StudentRecord } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  batchIssuanceItemUpdate: vi.fn(),
  batchIssuanceRunFindUnique: vi.fn(),
  batchIssuanceRunFindUniqueOrThrow: vi.fn(),
  batchIssuanceRunUpdate: vi.fn(),
  createBatchActivationLinks: vi.fn(),
  createCredentialIssuanceFromOffer: vi.fn(),
  credentialIssuanceUpdate: vi.fn(),
  credentialIssuanceUpdateMany: vi.fn(),
  findActiveCredentialIssuance: vi.fn(),
  getAllStudents: vi.fn(),
  recordCredentialOfferSentAudit: vi.fn(),
  selectStudentRecordsForCredentialIssuance: vi.fn(),
  sendCredentialActivationEmail: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  createBatchActivationLinks: mocks.createBatchActivationLinks,
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/config/env", () => ({
  env: { BATCH_ISSUANCE_PROCESSING_CONCURRENCY: 4 },
}));

vi.mock("@/lib/credentials/audit", () => ({
  recordCredentialOfferSentAudit: mocks.recordCredentialOfferSentAudit,
}));

vi.mock("@/lib/credentials/status", () => ({
  createCredentialIssuanceFromOffer: mocks.createCredentialIssuanceFromOffer,
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
    credentialIssuance: {
      update: mocks.credentialIssuanceUpdate,
      updateMany: mocks.credentialIssuanceUpdateMany,
    },
  },
}));

vi.mock("@/lib/email/credential-activation", () => ({
  sendCredentialActivationEmail: mocks.sendCredentialActivationEmail,
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
  MAX_BATCH_ISSUANCE_LIMIT: 100,
  parseBatchIssuanceSelection: vi.fn((selection) => selection ?? {}),
}));

vi.mock("@/lib/students/repository", () => ({
  getAllStudents: mocks.getAllStudents,
}));

vi.mock("@/lib/student-records/simulatedUniversityRecords", () => ({
  selectStudentRecordsForCredentialIssuance: mocks.selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID: "simulated-2026-cohort",
}));

import { previewBatchIssuance, processBatchRun } from "@/lib/issuance/batchRuns";

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
    mocks.createCredentialIssuanceFromOffer.mockResolvedValue({
      activationId: "activation-1",
      activationUrl: "http://localhost:3000/activate?token=token-1",
      credentialExchangeId: "credential-exchange-1",
      deliveryStatus: "DELIVERED",
      id: "issuance-1",
    });
    mocks.credentialIssuanceUpdate.mockResolvedValue({});
    mocks.credentialIssuanceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.recordCredentialOfferSentAudit.mockResolvedValue(undefined);
    mocks.selectStudentRecordsForCredentialIssuance.mockReturnValue([]);
    mocks.sendCredentialActivationEmail.mockResolvedValue(undefined);
  });

  it("caps previews at one hundred eligible students and reports overflow", async () => {
    const students = Array.from({ length: 101 }, (_, index) => ({
      ...student,
      credential: {
        ...student.credential,
        id: `credential-${index + 1}`,
        studentNumber: `STU${index + 1}`,
      },
      profile: {
        ...student.profile,
        email: `student-${index + 1}@example.edu`,
        id: `student-profile-${index + 1}`,
      },
    }));
    mocks.getAllStudents.mockResolvedValue(students);
    mocks.selectStudentRecordsForCredentialIssuance.mockReturnValue(students);

    const result = await previewBatchIssuance();

    expect(result.eligibleCount).toBe(100);
    expect(result.requestedCount).toBe(101);
    expect(result.skippedCount).toBe(1);
    expect(result.items.at(-1)).toMatchObject({
      reason: "Batch maximum of 100 students reached.",
      status: "Skipped",
      studentId: "STU101",
    });
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

  it("sends deterministic per-item idempotency keys when processing retryable items", async () => {
    const deliveredItem = {
      ...pendingItem,
      credentialIssuance: {
        activationId: "activation-1",
        activationUrl: "http://localhost:3000/activate?token=token-1",
        credentialExchangeId: "credential-exchange-1",
        createdAt: new Date("2026-04-27T09:01:00.000Z"),
        deliveryStatus: "DELIVERED",
        email: "student@example.edu",
        activationExpiresAt: new Date("2026-04-28T10:00:00.000Z"),
        id: "issuance-1",
      },
      credentialIssuanceId: "issuance-1",
      status: BatchIssuanceItemStatus.DELIVERED,
    };
    const completedRun = {
      ...pendingRun,
      completedAt: new Date("2026-04-27T09:01:00.000Z"),
      issuedCount: 1,
      items: [deliveredItem],
      status: BatchIssuanceRunStatus.COMPLETED,
    };

    mocks.batchIssuanceRunFindUnique.mockResolvedValueOnce({
      ...pendingRun,
      items: [{ ...pendingItem, status: BatchIssuanceItemStatus.DELIVERY_FAILED }],
    });
    mocks.createBatchActivationLinks.mockResolvedValueOnce({
      failures: [],
      offers: [{
        activationId: "activation-1",
        activationUrl: "unifywallet://activate?token=token-1",
        credentialExchangeId: "credential-exchange-1",
        email: "student@example.edu",
        expiresAt: "2026-04-28T10:00:00.000Z",
        externalId: "STU001",
      }],
    });
    mocks.batchIssuanceRunFindUniqueOrThrow.mockResolvedValueOnce({
      ...pendingRun,
      items: [deliveredItem],
    });
    mocks.batchIssuanceRunUpdate
      .mockResolvedValueOnce({ ...pendingRun, status: BatchIssuanceRunStatus.PROCESSING })
      .mockResolvedValueOnce(completedRun);

    const result = await processBatchRun("batch-1");

    expect(mocks.createBatchActivationLinks).toHaveBeenCalledWith({
      credentialDefinitionId: "cred-def-1",
      students: [
        expect.objectContaining({
          email: "student@example.edu",
          externalId: "STU001",
          idempotencyKey: "batch-issuance:batch-1:item-1",
        }),
      ],
    });
    expect(mocks.createCredentialIssuanceFromOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialExchangeId: "credential-exchange-1",
        studentId: "STU001",
      }),
    );
    expect(mocks.createCredentialIssuanceFromOffer.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendCredentialActivationEmail.mock.invocationCallOrder[0],
    );
    expect(result.status).toBe("Completed");
    expect(result.items[0]).toMatchObject({
      credentialId: "issuance-1",
      status: "Delivered",
      studentId: "STU001",
    });
  });

  it("does not send missing student records to the agent", async () => {
    const missingItem = { ...pendingItem, id: "item-missing", studentId: "MISSING001" };
    const failedItem = {
      ...missingItem,
      failureReason: "Student record was not found during batch processing.",
      status: BatchIssuanceItemStatus.FAILED,
    };
    const failedRun = {
      ...pendingRun,
      completedAt: new Date("2026-04-27T09:01:00.000Z"),
      failedCount: 1,
      items: [failedItem],
      status: BatchIssuanceRunStatus.FAILED,
    };

    mocks.batchIssuanceRunFindUnique.mockResolvedValueOnce({ ...pendingRun, items: [missingItem] });
    mocks.batchIssuanceItemUpdate.mockResolvedValueOnce(failedItem);
    mocks.batchIssuanceRunFindUniqueOrThrow.mockResolvedValueOnce({ ...pendingRun, items: [failedItem] });
    mocks.batchIssuanceRunUpdate
      .mockResolvedValueOnce({ ...pendingRun, status: BatchIssuanceRunStatus.PROCESSING })
      .mockResolvedValueOnce(failedRun);

    const result = await processBatchRun("batch-1");

    expect(mocks.createBatchActivationLinks).not.toHaveBeenCalled();
    expect(mocks.batchIssuanceItemUpdate).toHaveBeenCalledWith({
      data: {
        failureReason: "Student record was not found during batch processing.",
        status: BatchIssuanceItemStatus.FAILED,
      },
      where: { id: "item-missing" },
    });
    expect(result.status).toBe("Failed");
  });
});
