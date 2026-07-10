import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreateMany: vi.fn(),
  auditUpdateMany: vi.fn(),
  changeCredentialLifecycle: vi.fn(),
  issuanceFindFirst: vi.fn(),
  issuanceFindUnique: vi.fn(),
  issuanceUpdate: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  changeCredentialLifecycle: mocks.changeCredentialLifecycle,
}));

vi.mock("@/lib/db/prisma", () => {
  const transactionClient = {
    credentialAuditLog: {
      createMany: mocks.auditCreateMany,
      updateMany: mocks.auditUpdateMany,
    },
    credentialIssuance: {
      update: mocks.issuanceUpdate,
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
    mocks.changeCredentialLifecycle.mockResolvedValue({
      credentialExchangeId: "exchange-1",
      credentialRevocationId: "7",
      eventId: "event-1",
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

    expect(mocks.changeCredentialLifecycle).toHaveBeenCalledWith("exchange-1", "revoke", "Demo cleanup");
    expect(mocks.auditCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREDENTIAL_REVOKED",
          eventId: "event-revoked",
          metadata: expect.objectContaining({ previousStatus: "ACTIVE" }),
        }),
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
});
