import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  create: vi.fn(),
  deleteSchema: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  getActiveCustomFieldDefinitions: vi.fn(),
  issuanceSetup: vi.fn(),
  registerTrustedCredentialDefinition: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  issuanceSetup: mocks.issuanceSetup,
  registerTrustedCredentialDefinition: mocks.registerTrustedCredentialDefinition,
}));

vi.mock("@/lib/imports/customFields", () => ({
  getActiveCustomFieldDefinitions: mocks.getActiveCustomFieldDefinitions,
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn().mockResolvedValue({
    id: "university-1",
    issuerDid: "did:indy:bcovrin:test:issuer",
  }),
}));

vi.mock("@/lib/db/prisma", () => {
  const transaction = {
    auditLog: {
      create: mocks.auditCreate,
    },
    credentialSchema: {
      create: mocks.create,
      delete: mocks.deleteSchema,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) => operation(transaction)),
      credentialSchema: {
        findFirst: mocks.findFirst,
        findUnique: mocks.findUnique,
      },
    },
  };
});

import {
  createDraftCredentialSchemaVersion,
  CredentialSchemaVersionError,
  deleteDraftCredentialSchemaVersion,
  publishCredentialSchemaVersion,
  validateCredentialSchemaVersionInput,
} from "@/lib/university/credentialSchema";

describe("credential schema versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.findUnique.mockResolvedValue({
      id: "schema-row-2",
      schemaAttributes: ["studentNumber", "faculty", "year", "programme"],
      schemaName: "StudentIdentity",
      schemaVersion: "2.0",
      status: "DRAFT",
      universityProfileId: "university-1",
    });
    mocks.getActiveCustomFieldDefinitions.mockResolvedValue([]);
    mocks.issuanceSetup.mockResolvedValue({
      credentialDefinitionId: "cred-def-2",
      revocationRegistryDefinitionId: "rev-reg-2",
      schemaId: "schema-2",
    });
    mocks.registerTrustedCredentialDefinition.mockResolvedValue({ credentialDefinitionId: "cred-def-2" });
    mocks.create.mockImplementation(async ({ data }) => ({ id: "schema-row-2", ...data }));
    mocks.update.mockImplementation(async ({ data }) => ({ id: "schema-row-2", ...data }));
  });

  it("requires a version number and studentNumber", () => {
    expect(() =>
      validateCredentialSchemaVersionInput({ attributes: ["faculty"], schemaVersion: "version two" }),
    ).toThrow(CredentialSchemaVersionError);
    expect(() =>
      validateCredentialSchemaVersionInput({ attributes: ["faculty"], schemaVersion: "2.0" }),
    ).toThrow("studentNumber is required");
  });

  it("creates a local draft without registering ledger objects", async () => {
    const result = await createDraftCredentialSchemaVersion({
      actorId: "admin-1",
      attributes: ["studentNumber", "faculty", "year", "programme"],
      schemaVersion: "2.0",
    });

    expect(mocks.issuanceSetup).not.toHaveBeenCalled();
    expect(mocks.registerTrustedCredentialDefinition).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          schemaVersion: "2.0",
          status: "DRAFT",
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SCHEMA_VERSION_CREATED",
          actorId: "admin-1",
        }),
      }),
    );
    expect(result).toMatchObject({ isActive: false, schemaVersion: "2.0", status: "DRAFT" });
  });

  it("publishes a draft with revocation support before activating it", async () => {
    const result = await publishCredentialSchemaVersion({ actorId: "admin-1", schemaId: "schema-row-2" });

    expect(mocks.issuanceSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialDefinition: expect.objectContaining({ supportRevocation: true }),
        revocation: expect.objectContaining({ maximumCredentialNumber: 10000 }),
        schema: {
          attributes: ["studentNumber", "faculty", "year", "programme"],
          name: "StudentIdentity",
          version: "2.0",
        },
      }),
    );
    expect(mocks.registerTrustedCredentialDefinition).toHaveBeenCalledWith("cred-def-2", true);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, status: "RETIRED" }),
        where: { isActive: true, status: "ACTIVE", universityProfileId: "university-1" },
      }),
    );
    expect(result).toMatchObject({
      credentialDefinitionId: "cred-def-2",
      isActive: true,
      status: "ACTIVE",
    });
  });

  it("does not activate a schema when agent setup times out", async () => {
    mocks.issuanceSetup.mockRejectedValueOnce(
      new Error("Agent service request timed out after 60000ms."),
    );

    await expect(
      publishCredentialSchemaVersion({ actorId: "admin-1", schemaId: "schema-row-2" }),
    ).rejects.toThrow("Agent service request timed out after 60000ms.");

    expect(mocks.registerTrustedCredentialDefinition).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("does not activate a schema when trusted definition registration times out", async () => {
    mocks.registerTrustedCredentialDefinition.mockRejectedValueOnce(
      new Error("Agent service request timed out after 15000ms."),
    );

    await expect(
      publishCredentialSchemaVersion({ actorId: "admin-1", schemaId: "schema-row-2" }),
    ).rejects.toThrow("Agent service request timed out after 15000ms.");

    expect(mocks.issuanceSetup).toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a duplicate draft before writing anything", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      createDraftCredentialSchemaVersion({ attributes: ["studentNumber"], schemaVersion: "2.0" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.issuanceSetup).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  describe("deleteDraftCredentialSchemaVersion", () => {
    it("deletes a local draft and writes an audit log", async () => {
      await deleteDraftCredentialSchemaVersion({ actorId: "admin-1", schemaId: "schema-row-2" });

      expect(mocks.deleteSchema).toHaveBeenCalledWith({ where: { id: "schema-row-2" } });
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "SCHEMA_VERSION_DELETED",
            actorId: "admin-1",
            targetId: "schema-row-2",
          }),
        }),
      );
    });

    it("refuses to delete a published or retired version", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "schema-row-2",
        schemaVersion: "2.0",
        status: "ACTIVE",
        universityProfileId: "university-1",
      });

      await expect(
        deleteDraftCredentialSchemaVersion({ actorId: "admin-1", schemaId: "schema-row-2" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.deleteSchema).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    });

    it("rejects a schema id from another university", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "schema-row-2",
        schemaVersion: "2.0",
        status: "DRAFT",
        universityProfileId: "another-university",
      });

      await expect(
        deleteDraftCredentialSchemaVersion({ actorId: "admin-1", schemaId: "schema-row-2" }),
      ).rejects.toMatchObject({ status: 404 });
      expect(mocks.deleteSchema).not.toHaveBeenCalled();
    });
  });
});
