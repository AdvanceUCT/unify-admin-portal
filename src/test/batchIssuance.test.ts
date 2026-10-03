vi.mock("@/lib/config/env", () => ({
  env: { BATCH_ISSUANCE_PROCESSING_CONCURRENCY: 4 },
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findAttempt: vi.fn(),
  prepare: vi.fn(),
  deliver: vi.fn(),
  student: vi.fn(),
  issuance: vi.fn(),
  enrolment: vi.fn(),
  record: vi.fn(),
  overlay: vi.fn(),
}));
vi.mock("@/lib/credentials/preparedOffer", () => ({
  prepareOffer: mocks.prepare,
  deliverPreparedOffer: mocks.deliver,
}));
vi.mock("@/lib/credentials/validityPolicy", () => ({
  currentValidityPolicy: vi.fn(async () => ({
    startMonth: 2,
    startDay: 1,
    expiryMonth: 11,
    expiryDay: 30,
  })),
}));
vi.mock("@/lib/students/repository", () => ({
  getStudentById: mocks.student,
  getAllStudents: vi.fn(async () => []),
}));
vi.mock("@/lib/credentials/status", () => ({
  overlayCredentialStatus: mocks.overlay,
  overlayCredentialStatusForStudent: mocks.overlay,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    credentialOfferAttempt: { findUnique: mocks.findAttempt },
    credentialIssuance: { findFirst: mocks.issuance },
    credentialRenewalEnrolment: { findFirst: mocks.enrolment },
    credentialRenewalRecord: { findUnique: mocks.record },
  },
}));
import {
  parseBatchIssuanceSelection,
  queueRealStudentIssuance,
  queueRealStudentRenewal,
} from "@/lib/issuance/batchIssuance";
import { getSimulatedUniversityStudentRecordById } from "@/lib/student-records/simulatedUniversityRecords";
const student = getSimulatedUniversityStudentRecordById("student-demo-100")!;
const now = new Date("2026-08-10T10:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.student.mockResolvedValue(student);
  mocks.overlay.mockImplementation((value) => value);
  mocks.prepare.mockResolvedValue({ id: "attempt" });
  mocks.deliver.mockResolvedValue({
    id: "new",
    activationExpiresAt: new Date("2026-08-11T10:00:00Z"),
  });
});
describe("issuance and expired-only manual renewal", () => {
  it("validates batch limits and enrolment options", () => {
    expect(() => parseBatchIssuanceSelection({ limit: 101 })).toThrow(
      "between 1 and 100",
    );
    expect(() =>
      parseBatchIssuanceSelection({ autoRenew: true, renewalYears: 0 }),
    ).toThrow();
    expect(
      parseBatchIssuanceSelection({ autoRenew: true, renewalYears: 3 }),
    ).toMatchObject({ autoRenew: true, renewalYears: 3 });
  });
  it("persists issuance options with a stable academic-year key", async () => {
    await queueRealStudentIssuance(student.profile.id, now, "admin", {
      autoRenew: true,
      renewalYears: 3,
    });
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `student-issuance:${student.credential.studentNumber}:2026`,
        options: { autoRenew: true, renewalYears: 3 },
      }),
    );
  });
  it("resumes a prepared attempt rather than preparing changed attributes", async () => {
    const frozen = { id: "frozen" };
    mocks.findAttempt.mockResolvedValue(frozen);
    await queueRealStudentIssuance(student.profile.id, now);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.deliver).toHaveBeenCalledWith(frozen);
  });
  it.each([
    "ACTIVE",
    "SUSPENDED",
    "REVOKED",
    "OFFER_SENT",
    "ACCEPTED",
    "FAILED",
  ])("rejects manual renewal of %s credentials", async (lifecycleState) => {
    mocks.issuance.mockResolvedValue({ id: "old" });
    mocks.overlay.mockReturnValue({
      ...student,
      credential: { ...student.credential, lifecycleState },
    });
    await expect(
      queueRealStudentRenewal(student.profile.id, now),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("preserves an existing enrolment instead of restarting its allowance", async () => {
    mocks.issuance.mockResolvedValue({ id: "old" });
    mocks.overlay.mockReturnValue({
      ...student,
      credential: { ...student.credential, lifecycleState: "EXPIRED" },
    });
    mocks.enrolment.mockResolvedValue({ id: "enrolment" });
    mocks.record.mockResolvedValue({ id: "period", preparedAt: null });
    await queueRealStudentRenewal(student.profile.id, now, "admin", {
      autoRenew: true,
      renewalYears: 10,
    });
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        renewalId: "period",
        options: { autoRenew: false },
        supersedesIssuanceId: "old",
      }),
    );
  });
  it("blocks an unresolved replacement for the same period", async () => {
    mocks.issuance.mockResolvedValue({ id: "old" });
    mocks.overlay.mockReturnValue({
      ...student,
      credential: { ...student.credential, lifecycleState: "EXPIRED" },
    });
    mocks.enrolment.mockResolvedValue({ id: "enrolment" });
    mocks.record.mockResolvedValue({ preparedAt: now });
    await expect(
      queueRealStudentRenewal(student.profile.id, now),
    ).rejects.toThrow("replacement already exists");
  });
});
