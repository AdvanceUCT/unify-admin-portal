import { afterEach, describe, expect, it } from "vitest";
import {
  completeMockWalletActivation,
  getMockAdminState,
  queueMockBatchIssuance,
  resetMockActivationStore,
  resolveMockWalletActivation,
} from "@/lib/api/mockActivationStore";

const queuedAt = new Date("2026-04-27T10:00:00Z");

describe("mock activation store", () => {
  afterEach(() => {
    resetMockActivationStore();
  });

  it("queues delivered activation link state and keeps the credential offered", () => {
    const result = queueMockBatchIssuance(queuedAt);
    const state = getMockAdminState();
    const credential = state.credentials.find((candidate) => candidate.id === "credential-demo-002");

    expect(result).toMatchObject({
      batchId: "batch-001",
      issuedCredentialIds: ["credential-demo-002"],
      queuedAt: queuedAt.toISOString(),
      status: "Queued",
    });
    expect(result.activationDeliveries[0]).toMatchObject({
      batchId: "batch-001",
      credentialId: "credential-demo-002",
      status: "Delivered",
      studentId: "student-demo-002",
    });
    expect(result.activationDeliveries[0].activationUrl).toBe("unifywallet://activate?token=mock-act-7MFK2Q9V");
    expect(credential?.lifecycleState).toBe("Offered");
    expect(state.auditEvents.some((event) => event.eventType === "ActivationLinkDelivered")).toBe(true);
  });

  it("rejects unknown and expired activation tokens", () => {
    const unknown = resolveMockWalletActivation({ token: "missing-token" }, queuedAt);
    const expired = resolveMockWalletActivation({ token: "mock-act-7MFK2Q9V" }, queuedAt);

    expect(unknown).toMatchObject({ code: "ActivationTokenNotFound", ok: false, status: 404 });
    expect(expired).toMatchObject({ code: "ActivationTokenExpired", ok: false, status: 410 });
  });

  it("resolves a queued token into holder activation data", () => {
    queueMockBatchIssuance(queuedAt);
    const result = resolveMockWalletActivation({ token: "mock-act-7MFK2Q9V" }, queuedAt);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.data).toMatchObject({
      activationId: "activation-7MFK2Q9V",
      activationSource: "token",
      issuerLabel: "UNIFY Issuer Service",
      ledgerName: "BCovrin Test",
      studentId: "student-demo-002",
      walletId: "wallet-demo-001",
    });
    expect(result.data.invitationUrl).toContain("https://issuer.advanceuct.test/oob?oob=");
  });

  it("completes activation and marks the offered credential active", () => {
    queueMockBatchIssuance(queuedAt);
    const resolved = resolveMockWalletActivation({ token: "mock-act-7MFK2Q9V" }, queuedAt);

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
    const credential = state.credentials.find((candidate) => candidate.id === "credential-demo-002");
    const delivery = state.activationDeliveries.find((candidate) => candidate.credentialId === "credential-demo-002");

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
      targetId: "credential-demo-002",
    });
  });
});
