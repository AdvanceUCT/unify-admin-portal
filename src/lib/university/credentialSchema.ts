import { prisma } from "@/lib/db/prisma";
import type { CredentialSchema, Prisma } from "@/generated/prisma/client";

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
 * Updates an existing credential schema.
 *
 * @param id - The ID of the credential schema to update.
 * @param data - The data to update.
 * @returns The updated credential schema.
 */
export async function updateCredentialSchema(
  id: string,
  data: Prisma.CredentialSchemaUncheckedUpdateInput,
) {
  return prisma.credentialSchema.update({
    where: { id },
    data,
  });
}
