import { prisma } from "@/lib/db/prisma";
import type { CredentialSchema, Prisma } from "@/generated/prisma/client";
import { issuanceSetup, registerTrustedCredentialDefinition } from "@/lib/agentClient";
import { getUniversityProfile } from "@/lib/university/profile";

export const SUPPORTED_STUDENT_SCHEMA_ATTRIBUTES = [
  "studentNumber",
  "firstName",
  "lastName",
  "faculty",
  "programme",
  "year",
  "enrolmentStatus",
  "email",
  "institution",
  "validFrom",
  "expiresAt",
] as const;

const supportedAttributeSet = new Set<string>(SUPPORTED_STUDENT_SCHEMA_ATTRIBUTES);
const schemaVersionPattern = /^\d+\.\d+(?:\.\d+)?$/;

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
  const unsupported = attributes.filter((attribute) => !supportedAttributeSet.has(attribute));
  if (unsupported.length > 0) {
    throw new CredentialSchemaVersionError(`Unsupported schema attributes: ${unsupported.join(", ")}.`, 400);
  }

  return { attributes, schemaVersion };
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

export async function createCredentialSchemaVersion(input: {
  attributes: string[];
  schemaVersion: string;
}) {
  const validated = validateCredentialSchemaVersionInput(input);
  const profile = await getUniversityProfile();
  if (!profile?.issuerDid) {
    throw new CredentialSchemaVersionError("University issuer setup is incomplete.", 409);
  }

  const schemaName = "StudentIdentity";
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

  const tagSuffix = validated.schemaVersion.replace(/[^0-9a-z]/gi, "-");
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
      attributes: validated.attributes,
      name: schemaName,
      version: validated.schemaVersion,
    },
  });

  if (!registered.revocationRegistryDefinitionId) {
    throw new CredentialSchemaVersionError("Agent setup completed without a revocation registry.", 502);
  }

  await registerTrustedCredentialDefinition(registered.credentialDefinitionId, true);
  const activatedAt = new Date();

  return prisma.$transaction(async (transaction) => {
    await transaction.credentialSchema.updateMany({
      data: { isActive: false, retiredAt: activatedAt },
      where: { isActive: true, universityProfileId: profile.id },
    });

    return transaction.credentialSchema.create({
      data: {
        activatedAt,
        credentialDefinitionId: registered.credentialDefinitionId,
        isActive: true,
        revocationRegistryDefinitionId: registered.revocationRegistryDefinitionId,
        schemaAttributes: validated.attributes,
        schemaId: registered.schemaId,
        schemaName,
        schemaVersion: validated.schemaVersion,
        universityProfileId: profile.id,
      },
    });
  });
}

