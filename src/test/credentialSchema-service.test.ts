import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  createDraftSchemaVersion,
  publishCredentialSchema,
} from "@/lib/university/credentialSchema";

const database = vi.hoisted(() => {
  const transaction = {
    credentialSchema: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...database.transaction,
    $transaction: database.runTransaction,
  },
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

const writeAuditLogMock = vi.mocked(writeAuditLog);

beforeEach(() => {
  vi.clearAllMocks();
  database.runTransaction.mockImplementation(async (operation) =>
    operation(database.transaction),
  );
});

describe("createDraftSchemaVersion", () => {
  it("creates a draft row and does not touch any other row", async () => {
    database.transaction.credentialSchema.create.mockResolvedValueOnce({
      id: "schema_draft_1",
      schemaName: "StudentIdentity",
      schemaVersion: "2.0",
    });

    const created = await createDraftSchemaVersion({
      profileId: "profile_1",
      actorId: "admin_1",
      schemaName: "StudentIdentity",
      schemaVersion: "2.0",
      schemaAttributes: ["studentNumber", "firstName"],
      schemaId: "ledger-schema-2",
      credentialDefinitionId: "ledger-creddef-2",
    });

    expect(database.transaction.credentialSchema.create).toHaveBeenCalledWith({
      data: {
        universityProfileId: "profile_1",
        schemaName: "StudentIdentity",
        schemaVersion: "2.0",
        schemaAttributes: ["studentNumber", "firstName"],
        schemaId: "ledger-schema-2",
        credentialDefinitionId: "ledger-creddef-2",
        revocationRegistryDefinitionId: undefined,
        status: "DRAFT",
      },
    });
    expect(database.transaction.credentialSchema.update).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith({
      action: AuditAction.SCHEMA_VERSION_CREATED,
      actorId: "admin_1",
      targetType: "credential_schema",
      targetId: "schema_draft_1",
      meta: { schemaName: "StudentIdentity", schemaVersion: "2.0" },
    });
    expect(created.id).toBe("schema_draft_1");
  });
});

describe("publishCredentialSchema", () => {
  const draft = {
    id: "schema_draft_1",
    universityProfileId: "profile_1",
    status: "DRAFT",
    schemaName: "StudentIdentity",
    schemaVersion: "2.0",
  };

  it("retires the previously active row and activates the target draft", async () => {
    database.transaction.credentialSchema.findUnique.mockResolvedValueOnce(draft);
    database.transaction.credentialSchema.findFirst.mockResolvedValueOnce({
      id: "schema_active_1",
      status: "ACTIVE",
    });
    database.transaction.credentialSchema.update
      .mockResolvedValueOnce({ id: "schema_active_1", status: "RETIRED" })
      .mockResolvedValueOnce({ ...draft, status: "ACTIVE", publishedAt: new Date() });

    await publishCredentialSchema({
      schemaId: "schema_draft_1",
      profileId: "profile_1",
      actorId: "admin_1",
    });

    expect(database.transaction.credentialSchema.update).toHaveBeenNthCalledWith(1, {
      where: { id: "schema_active_1" },
      data: { status: "RETIRED" },
    });
    expect(database.transaction.credentialSchema.update).toHaveBeenNthCalledWith(2, {
      where: { id: "schema_draft_1" },
      data: { status: "ACTIVE", publishedAt: expect.any(Date) },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SCHEMA_PUBLISHED,
        actorId: "admin_1",
        targetId: "schema_draft_1",
        meta: expect.objectContaining({ previousSchemaId: "schema_active_1" }),
      }),
      database.transaction,
    );
  });

  it("publishes without retiring anything when there is no active row", async () => {
    database.transaction.credentialSchema.findUnique.mockResolvedValueOnce(draft);
    database.transaction.credentialSchema.findFirst.mockResolvedValueOnce(null);
    database.transaction.credentialSchema.update.mockResolvedValueOnce({
      ...draft,
      status: "ACTIVE",
    });

    await publishCredentialSchema({
      schemaId: "schema_draft_1",
      profileId: "profile_1",
      actorId: "admin_1",
    });

    expect(database.transaction.credentialSchema.update).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ previousSchemaId: null }),
      }),
      database.transaction,
    );
  });

  it("throws when the target schema is already active", async () => {
    database.transaction.credentialSchema.findUnique.mockResolvedValueOnce({
      ...draft,
      status: "ACTIVE",
    });

    await expect(
      publishCredentialSchema({
        schemaId: "schema_draft_1",
        profileId: "profile_1",
        actorId: "admin_1",
      }),
    ).rejects.toThrow("This version is already published.");
    expect(database.transaction.credentialSchema.update).not.toHaveBeenCalled();
  });

  it("throws when the schema belongs to a different profile", async () => {
    database.transaction.credentialSchema.findUnique.mockResolvedValueOnce({
      ...draft,
      universityProfileId: "profile_2",
    });

    await expect(
      publishCredentialSchema({
        schemaId: "schema_draft_1",
        profileId: "profile_1",
        actorId: "admin_1",
      }),
    ).rejects.toThrow("Schema version not found.");
    expect(database.transaction.credentialSchema.update).not.toHaveBeenCalled();
  });

  it("throws when the schema does not exist", async () => {
    database.transaction.credentialSchema.findUnique.mockResolvedValueOnce(null);

    await expect(
      publishCredentialSchema({
        schemaId: "schema_missing",
        profileId: "profile_1",
        actorId: "admin_1",
      }),
    ).rejects.toThrow("Schema version not found.");
  });
});
