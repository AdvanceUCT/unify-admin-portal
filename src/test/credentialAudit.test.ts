import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  auditCount: vi.fn(),
  auditFindMany: vi.fn(),
  issuanceFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    credentialAuditLog: {
      count: prismaMocks.auditCount,
      findMany: prismaMocks.auditFindMany,
    },
    credentialIssuance: {
      findMany: prismaMocks.issuanceFindMany,
    },
    user: {
      findMany: prismaMocks.userFindMany,
    },
  },
}));

import {
  getPaginatedCredentialOfferSentAuditLogs,
  getRecentCredentialAuditActivityEvents,
} from "@/lib/credentials/audit";

function auditLog(overrides: Record<string, unknown> = {}) {
  return {
    action: "OFFER_SENT",
    actorId: "admin-1",
    batchId: null,
    batchItemId: null,
    createdAt: new Date("2026-07-08T09:00:00.000Z"),
    credentialDefinitionId: "cred-def-1",
    credentialExchangeId: "exchange-1",
    credentialIssuanceId: "issuance-1",
    deliveryStatus: "DELIVERED",
    eventId: "event-1",
    id: "audit-1",
    message: "Credential activation offer delivered.",
    metadata: null,
    occurredAt: new Date("2026-07-08T09:00:00.000Z"),
    studentId: "STU001",
    ...overrides,
  };
}

describe("credential audit queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.auditCount.mockResolvedValue(1);
    prismaMocks.userFindMany.mockResolvedValue([{ id: "admin-1", name: "Ada Admin" }]);
    prismaMocks.issuanceFindMany.mockResolvedValue([
      { credentialExchangeId: "exchange-1", id: "issuance-1", schemaVersion: "1.2.0" },
    ]);
  });

  it("hydrates actor names and schema versions for paginated audit logs", async () => {
    prismaMocks.auditFindMany.mockResolvedValue([
      auditLog(),
      auditLog({
        actorId: "deleted-admin",
        credentialExchangeId: "exchange-2",
        credentialIssuanceId: "issuance-2",
        id: "audit-2",
      }),
      auditLog({ actorId: null, id: "audit-3" }),
    ]);

    const result = await getPaginatedCredentialOfferSentAuditLogs({ page: 1, pageSize: 25 });

    expect(result.logs[0]).toMatchObject({
      actorId: "admin-1",
      actorName: "Ada Admin",
      schemaVersion: "1.2.0",
    });
    expect(result.logs[1]).toMatchObject({
      actorId: "deleted-admin",
      actorName: null,
      schemaVersion: null,
    });
    expect(result.logs[2]).toMatchObject({
      actorId: null,
      actorName: null,
    });
  });

  it("builds recent dashboard events from selected audit actions without latest-state joins", async () => {
    prismaMocks.auditFindMany.mockResolvedValue([
      auditLog({
        action: "CREDENTIAL_REACTIVATED",
        id: "audit-reactivated",
        occurredAt: new Date("2026-07-08T11:00:00.000Z"),
      }),
      auditLog({
        action: "CREDENTIAL_SUSPENDED",
        id: "audit-suspended",
        occurredAt: new Date("2026-07-08T10:00:00.000Z"),
      }),
      auditLog({
        action: "CREDENTIAL_LIFECYCLE_ACTIVATED",
        id: "audit-activated",
        occurredAt: new Date("2026-07-08T09:00:00.000Z"),
      }),
    ]);

    const events = await getRecentCredentialAuditActivityEvents(10);

    expect(prismaMocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: {
            in: [
              "OFFER_SENT",
              "CREDENTIAL_LIFECYCLE_ACTIVATED",
              "CREDENTIAL_SUSPENDED",
              "CREDENTIAL_REACTIVATED",
              "CREDENTIAL_REVOKED",
            ],
          },
        },
      }),
    );
    expect(events.map((event) => [event.id, event.status])).toEqual([
      ["audit-reactivated", "ACTIVE"],
      ["audit-suspended", "SUSPENDED"],
      ["audit-activated", "ACTIVE"],
    ]);
  });
});
