import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  issuanceSetup: vi.fn(),
  registerTrustedCredentialDefinition: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  issuanceSetup: mocks.issuanceSetup,
  registerTrustedCredentialDefinition: mocks.registerTrustedCredentialDefinition,
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn().mockResolvedValue({
    id: "university-1",
    issuerDid: "did:indy:bcovrin:test:issuer",
  }),
}));

vi.mock("@/lib/db/prisma", () => {
  const transaction = {
    credentialSchema: {
      create: mocks.create,
      updateMany: mocks.updateMany,
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((operation: (client: typeof transaction) => unknown) => operation(transaction)),
      credentialSchema: {
        findFirst: mocks.findFirst,
      },
    },
  };
});

import {
  createCredentialSchemaVersion,
  CredentialSchemaVersionError,
  validateCredentialSchemaVersionInput,
} from "@/lib/university/credentialSchema";

describe("credential schema versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.issuanceSetup.mockResolvedValue({
      credentialDefinitionId: "cred-def-2",
      revocationRegistryDefinitionId: "rev-reg-2",
      schemaId: "schema-2",
    });
    mocks.registerTrustedCredentialDefinition.mockResolvedValue({ credentialDefinitionId: "cred-def-2" });
    mocks.create.mockImplementation(async ({ data }) => ({ id: "schema-row-2", ...data }));
  });

  it("requires a version number and studentNumber", () => {
    expect(() =>
      validateCredentialSchemaVersionInput({ attributes: ["faculty"], schemaVersion: "version two" }),
    ).toThrow(CredentialSchemaVersionError);
    expect(() =>
      validateCredentialSchemaVersionInput({ attributes: ["faculty"], schemaVersion: "2.0" }),
    ).toThrow("studentNumber is required");
  });

  it("registers the ledger objects before atomically activating the new database version", async () => {
    const result = await createCredentialSchemaVersion({
      attributes: ["studentNumber", "faculty", "year", "programme"],
      schemaVersion: "2.0",
    });

    expect(mocks.issuanceSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialDefinition: expect.objectContaining({ supportRevocation: true }),
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
        data: expect.objectContaining({ isActive: false }),
        where: { isActive: true, universityProfileId: "university-1" },
      }),
    );
    expect(result).toMatchObject({ credentialDefinitionId: "cred-def-2", isActive: true, schemaVersion: "2.0" });
  });

  it("rejects a duplicate version before writing to the ledger", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      createCredentialSchemaVersion({ attributes: ["studentNumber"], schemaVersion: "2.0" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.issuanceSetup).not.toHaveBeenCalled();
  });
});
