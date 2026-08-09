import { prisma } from "@/lib/db/prisma";
import type { CredentialSchema, Prisma } from "@/generated/prisma/client";
import { AuditAction, CredentialSchemaStatus } from "@/generated/prisma/enums";
import { issuanceSetup, registerTrustedCredentialDefinition } from "@/lib/agentClient";
import { getActiveCustomFieldDefinitions } from "@/lib/imports/customFields";
import { SYSTEM_FIELDS } from "@/lib/imports/mapping";
import { getUniversityProfile } from "@/lib/university/profile";

export const BUILT_IN_STUDENT_SCHEMA_ATTRIBUTES = [
  "studentNumber",
  "email",
  "firstName",
  "lastName",
  "faculty",
  "programme",
  "year",
  "institution",
  "validFrom",
  "expiresAt",
] as const;

const computedAttributeNames = new Set(["year", "institution", "validFrom", "expiresAt"]);
const schemaVersionPattern = /^\d+\.\d+(?:\.\d+)?$/;
const schemaName = "StudentIdentity";

export type SchemaAttributeAvailability = {
  available: boolean;
  label: string;
  name: string;
  source: "computed" | "custom" | "system" | "unsupported";
};

export class CredentialSchemaVersionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CredentialSchemaVersionError";
  }
}

export function validateCredentialSchemaVersionInput(input: {
  availableAttributes?: readonly string[];
  attributes: string[];
  schemaVersion: string;
}) {
  const schemaVersion = input.schemaVersion.trim();
  if (!schemaVersionPattern.test(schemaVersion)) {
    throw new CredentialSchemaVersionError("Schema version must look like 2.0 or 2.0.1.", 400);
  }

  const attributes = [...new Set(input.attributes.map((attribute) => attribute.trim()).filter(Boolean))];
  if (!attributes.includes("studentNumber")) {
    throw new CredentialSchemaVersionError("studentNumber is required in every student credential schema.", 400);
  }
  const supportedAttributeSet = new Set(input.availableAttributes ?? BUILT_IN_STUDENT_SCHEMA_ATTRIBUTES);
  const unsupported = attributes.filter((attribute) => !supportedAttributeSet.has(attribute));
  if (unsupported.length > 0) {
    throw new CredentialSchemaVersionError(`Unsupported schema attributes: ${unsupported.join(", ")}.`, 400);
  }

  return { attributes, schemaVersion };
}

export async function getSchemaAttributeAvailability(profileId: string): Promise<SchemaAttributeAvailability[]> {
  const customFields = await getActiveCustomFieldDefinitions(profileId);
  const rows = new Map<string, SchemaAttributeAvailability>();

  for (const field of SYSTEM_FIELDS) {
    rows.set(field.name, {
      available: true,
      label: field.label,
      name: field.name,
      source: "system",
    });
  }

  for (const name of BUILT_IN_STUDENT_SCHEMA_ATTRIBUTES) {
    if (rows.has(name)) continue;
    rows.set(name, {
      available: true,
      label: name,
      name,
      source: computedAttributeNames.has(name) ? "computed" : "system",
    });
  }

  for (const field of customFields) {
    rows.set(field.key, {
      available: true,
      label: field.label,
      name: field.key,
      source: "custom",
    });
  }

  return Array.from(rows.values()).sort((left, right) => {
    if (left.name === "studentNumber") return -1;
    if (right.name === "studentNumber") return 1;
    return left.label.localeCompare(right.label);
  });
}

export async function getAvailableSchemaAttributeNames(profileId: string) {
  const availability = await getSchemaAttributeAvailability(profileId);
  return availability.filter((attribute) => attribute.available).map((attribute) => attribute.name);
}

/**
 * Retrieves the active credential schema for a given university profile.
 *
 * @param profileId - The ID of the university profile.
 * @returns The active credential schema, or null if none exists.
 */
export async function getActiveCredentialSchema(
  profileId: string,
): Promise<CredentialSchema | null> {
  return prisma.credentialSchema.findFirst({
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    where: {
      universityProfileId: profileId,
      isActive: true,
      status: CredentialSchemaStatus.ACTIVE,
    },
  });
}

/**
 * Creates a new credential schema.
 *
 * @param data - The data for the new credential schema.
 * @returns The created credential schema.
 */
export async function createCredentialSchema(
  data: Omit<
    Prisma.CredentialSchemaUncheckedCreateInput,
    "id" | "createdAt" | "updatedAt"
  >,
) {
  return prisma.credentialSchema.create({
    data,
  });
}

export async function listCredentialSchemaVersions(profileId: string) {
  return prisma.credentialSchema.findMany({
    orderBy: [{ createdAt: "desc" }],
    where: { universityProfileId: profileId },
  });
}

export async function createDraftCredentialSchemaVersion(input: {
  actorId?: string | null;
  attributes: string[];
  schemaVersion: string;
}) {
  const profile = await getUniversityProfile();
  if (!profile) {
    throw new CredentialSchemaVersionError("University profile has not been configured.", 409);
  }
  const availableAttributes = await getAvailableSchemaAttributeNames(profile.id);
  const validated = validateCredentialSchemaVersionInput({ ...input, availableAttributes });

  const duplicate = await prisma.credentialSchema.findFirst({
    where: {
      schemaName,
      schemaVersion: validated.schemaVersion,
      universityProfileId: profile.id,
    },
  });
  if (duplicate) {
    throw new CredentialSchemaVersionError(`Schema version ${validated.schemaVersion} already exists.`, 409);
  }

  return prisma.$transaction(async (transaction) => {
    const schema = await transaction.credentialSchema.create({
      data: {
        isActive: false,
        schemaAttributes: validated.attributes,
        schemaName,
        schemaVersion: validated.schemaVersion,
        status: CredentialSchemaStatus.DRAFT,
        universityProfileId: profile.id,
      },
    });

    await transaction.auditLog.create({
      data: {
        action: AuditAction.SCHEMA_VERSION_CREATED,
        actorId: input.actorId ?? null,
        meta: {
          attributes: validated.attributes,
          schemaVersion: validated.schemaVersion,
        },
        targetId: schema.id,
        targetType: "CredentialSchema",
      },
    });

    return schema;
  });
}

export async function publishCredentialSchemaVersion(input: {
  actorId?: string | null;
  schemaId: string;
}) {
  const profile = await getUniversityProfile();
  if (!profile?.issuerDid) {
    throw new CredentialSchemaVersionError("University issuer setup is incomplete.", 409);
  }

  const draft = await prisma.credentialSchema.findUnique({ where: { id: input.schemaId } });
  if (!draft || draft.universityProfileId !== profile.id) {
    throw new CredentialSchemaVersionError("Draft schema version was not found.", 404);
  }
  if (draft.status !== CredentialSchemaStatus.DRAFT) {
    throw new CredentialSchemaVersionError("Only draft schema versions can be published.", 409);
  }

  const availableAttributes = await getAvailableSchemaAttributeNames(profile.id);
  validateCredentialSchemaVersionInput({
    attributes: draft.schemaAttributes,
    availableAttributes,
    schemaVersion: draft.schemaVersion,
  });

  const tagSuffix = draft.schemaVersion.replace(/[^0-9a-z]/gi, "-");
  const registered = await issuanceSetup({
    credentialDefinition: {
      supportRevocation: true,
      tag: `student-${tagSuffix}`,
    },
    issuerDid: profile.issuerDid,
    revocation: {
      maximumCredentialNumber: 10000,
      tag: `student-${tagSuffix}-revocation`,
    },
    schema: {
      attributes: draft.schemaAttributes,
      name: draft.schemaName,
      version: draft.schemaVersion,
    },
  });

  if (!registered.revocationRegistryDefinitionId) {
    throw new CredentialSchemaVersionError("Agent setup completed without a revocation registry.", 502);
  }

  await registerTrustedCredentialDefinition(registered.credentialDefinitionId, true);
  const activatedAt = new Date();

  return prisma.$transaction(async (transaction) => {
    await transaction.credentialSchema.updateMany({
      data: { isActive: false, retiredAt: activatedAt, status: CredentialSchemaStatus.RETIRED },
      where: { isActive: true, status: CredentialSchemaStatus.ACTIVE, universityProfileId: profile.id },
    });

    const schema = await transaction.credentialSchema.update({
      data: {
        activatedAt,
        credentialDefinitionId: registered.credentialDefinitionId,
        isActive: true,
        revocationRegistryDefinitionId: registered.revocationRegistryDefinitionId,
        publishedAt: activatedAt,
        schemaId: registered.schemaId,
        status: CredentialSchemaStatus.ACTIVE,
      },
      where: { id: draft.id },
    });

    await transaction.auditLog.create({
      data: {
        action: AuditAction.SCHEMA_PUBLISHED,
        actorId: input.actorId ?? null,
        meta: {
          credentialDefinitionId: registered.credentialDefinitionId,
          revocationRegistryDefinitionId: registered.revocationRegistryDefinitionId,
          schemaId: registered.schemaId,
          schemaVersion: draft.schemaVersion,
        },
        targetId: schema.id,
        targetType: "CredentialSchema",
      },
    });

    return schema;
  });
}

/**
 * Deletes a local draft schema version. Only DRAFT versions can be removed —
 * once a version is published it's registered on the ledger and existing
 * credentials may reference it, so it can only ever be retired, never deleted.
 */
export async function deleteDraftCredentialSchemaVersion(input: {
  actorId?: string | null;
  schemaId: string;
}) {
  const profile = await getUniversityProfile();
  if (!profile) {
    throw new CredentialSchemaVersionError("University profile has not been configured.", 409);
  }

  const draft = await prisma.credentialSchema.findUnique({ where: { id: input.schemaId } });
  if (!draft || draft.universityProfileId !== profile.id) {
    throw new CredentialSchemaVersionError("Draft schema version was not found.", 404);
  }
  if (draft.status !== CredentialSchemaStatus.DRAFT) {
    throw new CredentialSchemaVersionError("Only draft schema versions can be deleted.", 409);
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.auditLog.create({
      data: {
        action: AuditAction.SCHEMA_VERSION_DELETED,
        actorId: input.actorId ?? null,
        meta: {
          schemaVersion: draft.schemaVersion,
        },
        targetId: draft.id,
        targetType: "CredentialSchema",
      },
    });

    await transaction.credentialSchema.delete({ where: { id: draft.id } });
  });
}

export async function createAndPublishCredentialSchemaVersion(input: {
  actorId?: string | null;
  attributes: string[];
  schemaVersion: string;
}) {
  const draft = await createDraftCredentialSchemaVersion(input);
  return publishCredentialSchemaVersion({ actorId: input.actorId, schemaId: draft.id });
}

