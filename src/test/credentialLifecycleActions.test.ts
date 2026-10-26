import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreateMany: vi.fn(),
  auditUpdateMany: vi.fn(),
  changeCredentialLifecycle: vi.fn(),
  getCredentialLifecycle: vi.fn(),
  issuanceFindFirst: vi.fn(),
  issuanceFindUnique: vi.fn(),
  issuanceUpdate: vi.fn(),
  automationUpdateMany: vi.fn(),
  automationUpsert: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  changeCredentialLifecycle: mocks.changeCredentialLifecycle,
  getCredentialLifecycle: mocks.getCredentialLifecycle,
}));

vi.mock("@/lib/db/prisma", () => {
  const transactionClient = {
    $queryRaw: vi.fn(async () => []),
    credentialAuditLog: {
      findUnique: vi.fn(async () => null),
      createMany: mocks.auditCreateMany,
      updateMany: mocks.auditUpdateMany,
    },
    credentialIssuance: {
      findUnique: mocks.issuanceFindUnique,
      update: mocks.issuanceUpdate,
    },
    credentialAutomationJob: {
      updateMany: mocks.automationUpdateMany,
      upsert: mocks.automationUpsert,
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((operation: (client: typeof transactionClient) => unknown) => operation(transactionClient)),
      credentialIssuance: {
        findFirst: mocks.issuanceFindFirst,
        findUnique: mocks.issuanceFindUnique,
      },
    },
  };
});

import { CredentialLifecycleActionError, requestCredentialLifecycleChange } from "@/lib/credentials/lifecycleActions";

const issuance = {
  createdAt: new Date("2026-07-08T08:00:00.000Z"),
  credentialDefinitionId: "cred-def-1",
  credentialExchangeId: "exchange-1",
  credentialExpiresAt: null,
  credentialRevocationId: "7",
  id: "issuance-1",
  lifecycleStatus: "ACTIVE",
  reactivatedAt: null,
  revocationRegistryDefinitionId: "rev-reg-1",
  revokedAt: null,
  status: "ISSUED",
  studentId: "STU001",
  suspendedAt: null,
};

describe("credential lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issuanceFindFirst.mockResolvedValue(issuance);
    mocks.issuanceFindUnique.mockResolvedValue(issuance);
    mocks.getCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1",
      credentialRevocationId: "7",
      revocationRegistryDefinitionId: "rev-reg-1",
      status: "ACTIVE",
      revision: 0,
      eventId: "lifecycle-baseline:exchange-1",
      updatedAt: "2026-07-08T08:00:00.000Z",
    });
    mocks.changeCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1",
      credentialRevocationId: "7",
      eventId: "event-1",
      revision: 1,
      reason: "Enrolment review",
      revocationRegistryDefinitionId: "rev-reg-1",
      status: "SUSPENDED",
      statusListTimestamp: 1_720_000_000,
      updatedAt: "2026-07-08T09:00:00.000Z",
    });
  });

  it("persists a successful agent suspension and its audit event", async () => {
    await expect(
      requestCredentialLifecycleChange({
        action: "suspend",
        actorId: "admin-1",
        reason: "Enrolment review",
        studentId: "STU001",
      }),
    ).resolves.toEqual({
      lifecycleState: "SUSPENDED",
      updatedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(mocks.changeCredentialLifecycle).toHaveBeenCalledWith(
      "exchange-1",
      "suspend",
      "Enrolment review",
      0,
    );
    expect(mocks.issuanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lifecycleStatus: "SUSPENDED", lifecycleReason: "Enrolment review" }),
      }),
    );
    expect(mocks.auditCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CREDENTIAL_SUSPENDED", eventId: "event-1" }),
        skipDuplicates: true,
      }),
    );
  });

  it("creates a durable reactivation job for a timed suspension", async () => {
    const reactivateAt = new Date("2099-07-10T09:00:00.000Z");
    await requestCredentialLifecycleChange({
      action: "suspend",
      actorId: "admin-1",
      reactivateAt,
      reason: "Enrolment review",
      studentId: "STU001",
    });

    expect(mocks.automationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        credentialIssuanceId: "issuance-1",
        dueAt: reactivateAt,
        requestedByActorId: "admin-1",
        type: "AUTO_REACTIVATE",
      }),
    }));
    expect(mocks.auditCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CREDENTIAL_REACTIVATION_SCHEDULED" }),
    }));
  });

  it("allows revoking an offer-sent issuance when revocation metadata already exists", async () => {
    mocks.issuanceFindFirst.mockResolvedValue({
      ...issuance,
      lifecycleStatus: null,
      status: "OFFER_SENT",
    });
    mocks.changeCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1",
      credentialRevocationId: "7",
      eventId: "event-revoked",
      revision: 1,
      reason: "Demo cleanup",
      revocationRegistryDefinitionId: "rev-reg-1",
      status: "REVOKED",
      statusListTimestamp: 1_720_000_100,
      updatedAt: "2026-07-08T09:05:00.000Z",
    });

    await expect(
      requestCredentialLifecycleChange({
        action: "revoke",
        actorId: "admin-1",
        reason: "Demo cleanup",
        studentId: "STU001",
      }),
    ).resolves.toEqual({
      lifecycleState: "REVOKED",
      updatedAt: "2026-07-08T09:05:00.000Z",
    });

    expect(mocks.changeCredentialLifecycle).toHaveBeenCalledWith("exchange-1", "revoke", "Demo cleanup", 0);
    expect(mocks.auditCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREDENTIAL_REVOKED",
          eventId: "event-revoked",
          metadata: expect.objectContaining({ previousStatus: "ACTIVE", revision: 1 }),
        }),
      }),
    );
  });

  it("allows a replacement workflow to revoke an expired issuance", async () => {
    mocks.issuanceFindUnique.mockResolvedValue({
      ...issuance,
      credentialExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    mocks.changeCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1",
      credentialRevocationId: "7",
      eventId: "event-expired-revoked",
      revision: 1,
      revocationRegistryDefinitionId: "rev-reg-1",
      status: "REVOKED",
      updatedAt: "2026-07-08T09:05:00.000Z",
    });

    await expect(requestCredentialLifecycleChange({
      action: "revoke",
      credentialIssuanceId: "issuance-1",
      reason: "Replacement credential activated.",
      studentId: "STU001",
    })).resolves.toMatchObject({ lifecycleState: "REVOKED" });
  });

  it("looks up lifecycle issuances by both profile id and student number", async () => {
    await requestCredentialLifecycleChange({
      action: "suspend",
      actorId: "admin-1",
      reason: "Enrolment review",
      studentId: "student-demo-099",
      studentLookupIds: ["student-demo-099", "VOSCAL099"],
    });

    expect(mocks.issuanceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          credentialExchangeId: { not: null },
          studentId: { in: ["student-demo-099", "VOSCAL099"] },
        },
      }),
    );
  });

  it("rejects legacy credentials before calling the agent", async () => {
    mocks.issuanceFindFirst.mockResolvedValue({
      ...issuance,
      credentialRevocationId: null,
      lifecycleStatus: null,
      revocationRegistryDefinitionId: null,
    });

    const error = await requestCredentialLifecycleChange({
      action: "suspend",
      reason: "Enrolment review",
      studentId: "STU001",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(CredentialLifecycleActionError);
    expect((error as CredentialLifecycleActionError).status).toBe(409);
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
  });

  it("does not persist lifecycle or audit changes when the agent call times out", async () => {
    mocks.changeCredentialLifecycle.mockRejectedValueOnce(
      new Error("Agent service request timed out after 15000ms."),
    );

    await expect(
      requestCredentialLifecycleChange({
        action: "suspend",
        actorId: "admin-1",
        reason: "Enrolment review",
        studentId: "STU001",
      }),
    ).rejects.toThrow("Agent service request timed out after 15000ms.");

    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
    expect(mocks.auditUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["suspend", "reactivate", "revoke"] as const)("blocks %s before a ledger write when the deployed agent omits revisions", async (action) => {
    mocks.issuanceFindFirst.mockResolvedValue({ ...issuance, lifecycleStatus: action === "reactivate" ? "SUSPENDED" : "ACTIVE" });
    mocks.getCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1", credentialRevocationId: "7", revocationRegistryDefinitionId: "rev-reg-1",
      status: "ACTIVE", updatedAt: "2026-07-08T08:00:00.000Z",
    });

    await expect(requestCredentialLifecycleChange({ action, reason: "Review", studentId: "STU001" }))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("Update the agent service") });
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
  });

  it("recovers a revocation already committed by the agent without another write", async () => {
    mocks.getCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1", credentialRevocationId: "7", revocationRegistryDefinitionId: "rev-reg-1",
      status: "REVOKED", revision: 0, eventId: "lifecycle-baseline:exchange-1",
      reason: "Original revocation", updatedAt: "2026-07-08T08:30:00.000Z",
    });

    await expect(requestCredentialLifecycleChange({ action: "revoke", actorId: "retry-admin", reason: "Retry", studentId: "STU001" }))
      .resolves.toEqual({ lifecycleState: "REVOKED", updatedAt: "2026-07-08T08:30:00.000Z" });
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lifecycleRevision: 0, lifecycleStatus: "REVOKED", lifecycleReason: "Original revocation" }),
    }));
    expect(mocks.auditCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CREDENTIAL_REVOKED", actorId: undefined, occurredAt: new Date("2026-07-08T08:30:00.000Z") }),
    }));
    expect(mocks.auditUpdateMany).not.toHaveBeenCalled();
  });

  it("reconciles terminal revocation before rejecting a stale suspension", async () => {
    mocks.getCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1", credentialRevocationId: "7", revocationRegistryDefinitionId: "rev-reg-1",
      status: "REVOKED", revision: 2, eventId: "revoked-2", updatedAt: "2026-07-08T08:30:00.000Z",
    });
    await expect(requestCredentialLifecycleChange({ action: "suspend", reason: "Review", studentId: "STU001" }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.issuanceUpdate).toHaveBeenCalled();
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
  });

  it("rejects a snapshot for another credential before a ledger write", async () => {
    mocks.getCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "another-exchange", credentialRevocationId: "7", revocationRegistryDefinitionId: "rev-reg-1",
      status: "ACTIVE", revision: 0, eventId: "baseline", updatedAt: "2026-07-08T08:00:00.000Z",
    });
    await expect(requestCredentialLifecycleChange({ action: "revoke", reason: "Review", studentId: "STU001" }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
  });

  it("does not submit scheduled work against a changed revision", async () => {
    await expect(requestCredentialLifecycleChange({ action: "suspend", reason: "Review", studentId: "STU001", expectedLifecycleRevision: 3 }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
  });

  it("does not mutate an agent whose saved revision is behind the portal", async () => {
    mocks.issuanceFindFirst.mockResolvedValue({ ...issuance, lifecycleRevision: 4 });
    await expect(requestCredentialLifecycleChange({ action: "revoke", reason: "Review", studentId: "STU001" }))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining("behind the portal") });
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
  });

  it("still rejects a revisionless write response if the deployment changes after preflight", async () => {
    mocks.changeCredentialLifecycle.mockResolvedValueOnce({
      credentialExchangeId: "exchange-1", credentialRevocationId: "7", revocationRegistryDefinitionId: "rev-reg-1",
      status: "REVOKED", updatedAt: "2026-07-08T08:30:00.000Z",
    });
    await expect(requestCredentialLifecycleChange({ action: "revoke", reason: "Review", studentId: "STU001" }))
      .rejects.toMatchObject({ status: 503 });
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
  });

  it("does not write if the preflight snapshot cannot be read", async () => {
    mocks.getCredentialLifecycle.mockRejectedValueOnce(new Error("Agent unavailable"));
    await expect(requestCredentialLifecycleChange({ action: "revoke", reason: "Review", studentId: "STU001" }))
      .rejects.toThrow("Agent unavailable");
    expect(mocks.changeCredentialLifecycle).not.toHaveBeenCalled();
    expect(mocks.issuanceUpdate).not.toHaveBeenCalled();
  });
});
