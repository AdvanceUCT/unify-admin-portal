import { prisma } from "@/lib/db/prisma";
import type { CredentialSchema, Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { runSerializableTransaction } from "@/lib/db/transaction";

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
    where: {
      universityProfileId: profileId,
      isActive: true,
    },
  });
}

/**
 * Lists every schema version for a university profile, newest first.
 *
 * @param profileId - The ID of the university profile.
 */
export async function listCredentialSchemas(
  profileId: string,
): Promise<CredentialSchema[]> {
  return prisma.credentialSchema.findMany({
    where: { universityProfileId: profileId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Retrieves a single credential schema version by its ID.
 *
 * @param id - The ID of the credential schema.
 */
export async function getCredentialSchemaById(
  id: string,
): Promise<CredentialSchema | null> {
  return prisma.credentialSchema.findUnique({ where: { id } });
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

/**
 * Creates a new version of a university's credential schema and retires the
 * previously active version. Runs as a single serializable transaction so
 * there is never more than one active version for a university profile.
 *
 * Already-issued credentials reference their credential definition directly
 * (not the schema row), so retiring the old version does not affect them.
 *
 * @param input.previousSchemaId - The ID of the version being retired, used for the audit trail.
 */
export async function createSchemaVersion(input: {
  profileId: string;
  actorId: string;
  previousSchemaId?: string;
  schemaName: string;
  schemaVersion: string;
  schemaAttributes: string[];
  schemaId?: string;
  credentialDefinitionId?: string;
  revocationRegistryDefinitionId?: string;
}): Promise<CredentialSchema> {
  const {
    profileId,
    actorId,
    previousSchemaId,
    schemaName,
    schemaVersion,
    schemaAttributes,
    schemaId,
    credentialDefinitionId,
    revocationRegistryDefinitionId,
  } = input;

  return runSerializableTransaction(async (transaction) => {
    await transaction.credentialSchema.updateMany({
      where: { universityProfileId: profileId, isActive: true },
      data: { isActive: false },
    });

    const created = await transaction.credentialSchema.create({
      data: {
        universityProfileId: profileId,
        schemaName,
        schemaVersion,
        schemaAttributes,
        schemaId,
        credentialDefinitionId,
        revocationRegistryDefinitionId,
        isActive: true,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.SCHEMA_VERSION_CREATED,
        actorId,
        targetType: "credential_schema",
        targetId: created.id,
        meta: {
          schemaName,
          schemaVersion,
          previousSchemaId: previousSchemaId ?? null,
        },
      },
      transaction,
    );

    return created;
  });
}

