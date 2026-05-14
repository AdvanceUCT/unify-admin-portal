import { afterEach, describe, expect, it } from "vitest";
import {
  completeMockWalletActivation,
  createMockBatchRun,
  getMockAdminState,
  getMockBatchRunDetail,
  listMockBatchRuns,
  previewMockBatchIssuance,
  queueMockBatchIssuance,
  resetMockActivationStore,
  resolveMockWalletActivation,
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
    expect(result.activationDeliveries[0].activationUrl).toMatch(/^unifywallet:\/\/activate\?token=/);
    expect(credential?.lifecycleState).toBe("Offered");
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

  it("rejects unknown and expired activation tokens", () => {
    const queued = queueMockBatchIssuance(queuedAt);
    const token = new URL(queued.activationDeliveries[0].activationUrl).searchParams.get("token") ?? "";
    const unknown = resolveMockWalletActivation({ token: "missing-token" }, queuedAt);
    const expired = resolveMockWalletActivation({ token }, new Date("2026-04-28T10:01:00Z"));

    expect(unknown).toMatchObject({ code: "ActivationTokenNotFound", ok: false, status: 404 });
    expect(expired).toMatchObject({ code: "ActivationTokenExpired", ok: false, status: 410 });
  });

  it("resolves a queued token into holder activation data", () => {
    const queued = queueMockBatchIssuance(queuedAt);
    const token = new URL(queued.activationDeliveries[0].activationUrl).searchParams.get("token") ?? "";
    const result = resolveMockWalletActivation({ token }, queuedAt);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.data).toMatchObject({
      activationSource: "token",
      issuerLabel: "UNIFY Issuer Service",
      ledgerName: "BCovrin Test",
      studentId: queued.activationDeliveries[0].studentId,
    });
    expect(result.data.activationId).toMatch(/^activation-/);
    expect(result.data.walletId).toMatch(/^wallet-demo-/);
    expect(result.data.invitationUrl).toContain("https://issuer.advanceuct.test/oob?oob=");
  });

  it("completes activation and marks the offered credential active", () => {
    const queued = queueMockBatchIssuance(queuedAt);
    const firstDelivery = queued.activationDeliveries[0];
    const token = new URL(firstDelivery.activationUrl).searchParams.get("token") ?? "";
    const resolved = resolveMockWalletActivation({ token }, queuedAt);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }

    const result = completeMockWalletActivation(
      {
        activationId: resolved.data.activationId,
        credentialRecordId: "credential-record-demo",
        holderConnectionId: "connection-demo",
      },
      new Date("2026-04-27T10:05:00Z"),
    );
    const state = getMockAdminState();
    const credential = state.credentials.find((candidate) => candidate.id === firstDelivery.credentialId);
    const delivery = state.activationDeliveries.find((candidate) => candidate.credentialId === firstDelivery.credentialId);

    expect(result.ok).toBe(true);
    expect(credential?.lifecycleState).toBe("Active");
    expect(delivery).toMatchObject({
      activatedAt: "2026-04-27T10:05:00.000Z",
      credentialRecordId: "credential-record-demo",
      holderConnectionId: "connection-demo",
    });
    expect(state.auditEvents[0]).toMatchObject({
      eventType: "CredentialActivated",
      result: "Success",
      targetId: firstDelivery.credentialId,
    });
  });
});
