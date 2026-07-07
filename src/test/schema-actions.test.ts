import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSchemaVersionAction,
  publishSchemaVersionAction,
} from "@/app/(admin)/schemas/actions";
import * as agentClient from "@/lib/agentClient";
import { requireRole } from "@/lib/auth/session";
import {
  createDraftSchemaVersion,
  getActiveCredentialSchema,
  publishCredentialSchema,
} from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import { revalidatePath } from "next/cache";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
}));

vi.mock("@/lib/university/credentialSchema", () => ({
  createDraftSchemaVersion: vi.fn(),
  getActiveCredentialSchema: vi.fn(),
  publishCredentialSchema: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  issuanceSetup: vi.fn(),
  AgentServiceError: class AgentServiceError extends Error {
    status: number;
    details: unknown;
    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.status = status;
      this.details = details;
    }
  },
}));

const requireRoleMock = vi.mocked(requireRole);
const getUniversityProfileMock = vi.mocked(getUniversityProfile);
const getActiveCredentialSchemaMock = vi.mocked(getActiveCredentialSchema);
const createDraftSchemaVersionMock = vi.mocked(createDraftSchemaVersion);
const publishCredentialSchemaMock = vi.mocked(publishCredentialSchema);
const issuanceSetupMock = vi.mocked(agentClient.issuanceSetup);
const revalidatePathMock = vi.mocked(revalidatePath);

describe("schema actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      user: { id: "admin_1", role: "ADMIN" },
    } as Awaited<ReturnType<typeof requireRole>>);
    getUniversityProfileMock.mockResolvedValue({
      id: "profile_1",
      issuerDid: "did:example:issuer",
    } as Awaited<ReturnType<typeof getUniversityProfile>>);
  });

  describe("createSchemaVersionAction", () => {
    it("creates a draft version instead of activating it", async () => {
      getActiveCredentialSchemaMock.mockResolvedValue({
        id: "schema_active",
        schemaName: "StudentIdentity",
        schemaVersion: "1.0",
      } as Awaited<ReturnType<typeof getActiveCredentialSchema>>);
      issuanceSetupMock.mockResolvedValue({
        schemaId: "ledger-schema-2",
        credentialDefinitionId: "ledger-creddef-2",
        revocationRegistryDefinitionId: undefined,
      } as Awaited<ReturnType<typeof agentClient.issuanceSetup>>);

      const formData = new FormData();
      formData.set("version", "2.0");
      formData.set("attributes", "studentNumber\nfirstName");

      await createSchemaVersionAction(formData);

      expect(createDraftSchemaVersionMock).toHaveBeenCalledWith({
        profileId: "profile_1",
        actorId: "admin_1",
        schemaName: "StudentIdentity",
        schemaVersion: "2.0",
        schemaAttributes: ["studentNumber", "firstName"],
        schemaId: "ledger-schema-2",
        credentialDefinitionId: "ledger-creddef-2",
        revocationRegistryDefinitionId: undefined,
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/schemas");
    });

    it("rejects a version equal to the current active version", async () => {
      getActiveCredentialSchemaMock.mockResolvedValue({
        id: "schema_active",
        schemaName: "StudentIdentity",
        schemaVersion: "1.0",
      } as Awaited<ReturnType<typeof getActiveCredentialSchema>>);

      const formData = new FormData();
      formData.set("version", "1.0");
      formData.set("attributes", "studentNumber");

      await expect(createSchemaVersionAction(formData)).rejects.toThrow(
        "Version 1.0 is already the active version.",
      );
      expect(createDraftSchemaVersionMock).not.toHaveBeenCalled();
    });
  });

  describe("publishSchemaVersionAction", () => {
    it("publishes the given draft and revalidates the schemas page", async () => {
      const formData = new FormData();
      formData.set("schemaId", "schema_draft_1");

      await publishSchemaVersionAction(formData);

      expect(publishCredentialSchemaMock).toHaveBeenCalledWith({
        schemaId: "schema_draft_1",
        profileId: "profile_1",
        actorId: "admin_1",
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/schemas");
    });

    it("throws when schemaId is missing", async () => {
      const formData = new FormData();

      await expect(publishSchemaVersionAction(formData)).rejects.toThrow(
        "Schema version is required.",
      );
      expect(publishCredentialSchemaMock).not.toHaveBeenCalled();
    });

    it("rejects roles without schema:write permission", async () => {
      requireRoleMock.mockResolvedValue({
        user: { id: "viewer_1", role: "VIEWER" },
      } as Awaited<ReturnType<typeof requireRole>>);

      const formData = new FormData();
      formData.set("schemaId", "schema_draft_1");

      await expect(publishSchemaVersionAction(formData)).rejects.toThrow();
      expect(publishCredentialSchemaMock).not.toHaveBeenCalled();
    });
  });
});
