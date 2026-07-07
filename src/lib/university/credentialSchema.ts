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
      status: "ACTIVE",
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
 * Creates a new draft version of a university's credential schema. The
 * draft sits alongside the current active version and does not affect
 * issuance until an admin explicitly publishes it via
 * `publishCredentialSchema`.
 */
export async function createDraftSchemaVersion(input: {
  profileId: string;
  actorId: string;
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
    schemaName,
    schemaVersion,
    schemaAttributes,
    schemaId,
    credentialDefinitionId,
    revocationRegistryDefinitionId,
  } = input;

  const created = await prisma.credentialSchema.create({
    data: {
      universityProfileId: profileId,
      schemaName,
      schemaVersion,
      schemaAttributes,
      schemaId,
      credentialDefinitionId,
      revocationRegistryDefinitionId,
      status: "DRAFT",
    },
  });

  await writeAuditLog({
    action: AuditAction.SCHEMA_VERSION_CREATED,
    actorId,
    targetType: "credential_schema",
    targetId: created.id,
    meta: {
      schemaName,
      schemaVersion,
    },
  });

  return created;
}

/**
 * Publishes a draft credential schema version, making it the active schema
 * for its university profile. Atomically retires the currently active
 * version (if any) in the same serializable transaction, so there is never
 * more than one active version for a university profile.
 *
 * Already-issued credentials reference their credential definition directly
 * (not the schema row), so retiring the old version does not affect them.
 *
 * @throws If the schema doesn't exist, doesn't belong to the given profile,
 *   or is not in DRAFT status.
 */
export async function publishCredentialSchema(input: {
  schemaId: string;
  profileId: string;
  actorId: string;
}): Promise<CredentialSchema> {
  const { schemaId, profileId, actorId } = input;

  return runSerializableTransaction(async (transaction) => {
    const target = await transaction.credentialSchema.findUnique({
      where: { id: schemaId },
    });

    if (!target || target.universityProfileId !== profileId) {
      throw new Error("Schema version not found.");
    }
    if (target.status === "ACTIVE") {
      throw new Error("This version is already published.");
    }
    if (target.status !== "DRAFT") {
      throw new Error("Only draft versions can be published.");
    }

    const previousActive = await transaction.credentialSchema.findFirst({
      where: { universityProfileId: profileId, status: "ACTIVE" },
    });

    if (previousActive) {
      await transaction.credentialSchema.update({
        where: { id: previousActive.id },
        data: { status: "RETIRED" },
      });
    }

    const published = await transaction.credentialSchema.update({
      where: { id: schemaId },
      data: { status: "ACTIVE", publishedAt: new Date() },
    });

    await writeAuditLog(
      {
        action: AuditAction.SCHEMA_PUBLISHED,
        actorId,
        targetType: "credential_schema",
        targetId: published.id,
        meta: {
          schemaName: published.schemaName,
          schemaVersion: published.schemaVersion,
          previousSchemaId: previousActive?.id ?? null,
        },
      },
      transaction,
    );

    return published;
  });
}

