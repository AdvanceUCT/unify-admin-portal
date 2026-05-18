import { afterEach, describe, expect, it } from "vitest";
import {
  createMockBatchRun,
  getMockAdminState,
  getMockBatchRunDetail,
  listMockBatchRuns,
  previewMockBatchIssuance,
  queueMockBatchIssuance,
  resetMockActivationStore,
} from "@/lib/api/mockActivationStore";
import { mockStudents } from "@/lib/api/mockData";
import { selectStudentRecordsForCredentialIssuance } from "@/lib/student-records/simulatedUniversityRecords";

const queuedAt = new Date("2026-04-27T10:00:00Z");

describe("mock activation store", () => {
  afterEach(() => {
    resetMockActivationStore();
  });

  it("queues delivered activation link state and keeps the credential offered", () => {
    const issuableStudents = selectStudentRecordsForCredentialIssuance(mockStudents);
    const result = queueMockBatchIssuance(queuedAt);
    const state = getMockAdminState();
    const credential = state.credentials.find((candidate) => candidate.id === issuableStudents[0].credential.id);

    expect(result).toMatchObject({
      batchId: "batch-20260427100000",
      issuedCredentialIds: issuableStudents.map((student) => student.credential.id),
      queuedAt: queuedAt.toISOString(),
      status: "Queued",
    });
    expect(result.activationDeliveries).toHaveLength(issuableStudents.length);
    expect(result.activationDeliveries[0]).toMatchObject({
      batchId: result.batchId,
      credentialId: issuableStudents[0].credential.id,
      status: "Delivered",
      studentId: issuableStudents[0].profile.id,
    });
    expect(result.activationDeliveries[0].activationUrl).toMatch(/^http:\/\/localhost:3000\/activate\?token=/);
    expect(credential?.lifecycleState).toBe("OFFER_SENT");
    expect(state.auditEvents.filter((event) => event.eventType === "ActivationLinkDelivered")).toHaveLength(
      issuableStudents.length,
    );
  });

  it("previews and records batch run history", () => {
    const preview = previewMockBatchIssuance({ faculty: "Commerce" });
    const run = createMockBatchRun({ faculty: "Commerce" }, queuedAt);
    const runs = listMockBatchRuns();
    const detail = getMockBatchRunDetail(run.batchId);

    expect(preview.eligibleCount).toBe(17);
    expect(run).toMatchObject({
      eligibleCount: 17,
      issuedCount: 17,
      skippedCount: 0,
      status: "Completed",
    });
    expect(runs[0].batchId).toBe(run.batchId);
    expect(detail?.items).toHaveLength(17);
  });
});
