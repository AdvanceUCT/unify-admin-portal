import { beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialIssuanceStatus, CredentialLifecycleStatus } from "@/generated/prisma/enums";
import {
  createCredentialIssuanceFromOffer,
  recordCredentialStateChangedEvent,
} from "@/lib/credentials/status";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    credentialAuditLog: {
      createMany: vi.fn(),
    },
    credentialAutomationJob: {
      upsert: vi.fn(),
    },
    credentialEventLog: {
      createMany: vi.fn(),
    },
    credentialIssuance: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const credentialIssuance = vi.mocked(prisma.credentialIssuance);
const credentialEventLog = vi.mocked(prisma.credentialEventLog);
const credentialAuditLog = vi.mocked(prisma.credentialAuditLog);
const credentialAutomationJob = vi.mocked(prisma.credentialAutomationJob);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("credential issuance persistence", () => {
  it("stores credential expiry when creating an offer record", async () => {
    const credentialExpiresAt = new Date("2026-05-27T10:00:00.000Z");

    await createCredentialIssuanceFromOffer({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-1",
      credentialExpiresAt,
      studentId: "WOOJOS100",
      wasDelivered: true,
    });

    expect(credentialIssuance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        credentialExpiresAt,
      }),
    }));
  });

  it("updates issuedAt and lifecycle state from issued webhooks without changing stored expiry", async () => {
    const credentialExpiresAt = new Date("2026-05-27T10:00:00.000Z");
    credentialIssuance.findUnique.mockResolvedValueOnce({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-1",
      credentialExpiresAt,
      credentialRevocationId: null,
      id: "issuance-1",
      issuedAt: null,
      lifecycleStatus: null,
      lifecycleStatusUpdatedAt: null,
      revocationRegistryDefinitionId: null,
      renewedFromIssuanceId: "issuance-old",
      status: CredentialIssuanceStatus.OFFER_SENT,
      studentId: "WOOJOS100",
    } as never);
    credentialEventLog.createMany.mockResolvedValueOnce({ count: 1 } as never);

    await recordCredentialStateChangedEvent({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-1",
      credentialRevocationId: "1",
      eventId: "event-1",
      previousState: "credential-issued",
      revocationRegistryDefinitionId: "rev-reg-1",
      state: "done",
      timestamp: "2026-04-28T10:00:00.000Z",
      type: "credential.stateChanged",
    });

    expect(credentialIssuance.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issuedAt: new Date("2026-04-28T10:00:00.000Z"),
        lifecycleStatus: CredentialLifecycleStatus.ACTIVE,
        lifecycleStatusUpdatedAt: new Date("2026-04-28T10:00:00.000Z"),
      }),
      where: { id: "issuance-1" },
    });
    expect(credentialIssuance.update.mock.calls[0][0].data).not.toHaveProperty("credentialExpiresAt");
    expect(credentialAuditLog.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREDENTIAL_LIFECYCLE_ACTIVATED",
        credentialIssuanceId: "issuance-1",
        eventId: "credential-activated:credential-exchange-1",
        studentId: "WOOJOS100",
      }),
      skipDuplicates: true,
    });
    expect(credentialAutomationJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        credentialIssuanceId: "issuance-old",
        type: "REVOKE_REPLACED",
      }),
    }));
    expect(credentialExpiresAt.toISOString()).toBe("2026-05-27T10:00:00.000Z");
  });

  it("does not duplicate activation audit rows for duplicate done webhooks", async () => {
    credentialIssuance.findUnique.mockResolvedValueOnce({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-1",
      credentialExpiresAt: null,
      credentialRevocationId: "1",
      id: "issuance-1",
      issuedAt: new Date("2026-04-28T10:00:00.000Z"),
      lifecycleStatus: CredentialLifecycleStatus.ACTIVE,
      lifecycleStatusUpdatedAt: new Date("2026-04-28T10:00:00.000Z"),
      revocationRegistryDefinitionId: "rev-reg-1",
      status: CredentialIssuanceStatus.ISSUED,
      studentId: "WOOJOS100",
    } as never);
    credentialEventLog.createMany.mockResolvedValueOnce({ count: 0 } as never);

    await recordCredentialStateChangedEvent({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-1",
      credentialRevocationId: "1",
      eventId: "event-1",
      previousState: "credential-issued",
      revocationRegistryDefinitionId: "rev-reg-1",
      state: "done",
      timestamp: "2026-04-28T10:00:00.000Z",
      type: "credential.stateChanged",
    });

    expect(credentialIssuance.update).not.toHaveBeenCalled();
    expect(credentialAuditLog.createMany).not.toHaveBeenCalled();
  });
});
