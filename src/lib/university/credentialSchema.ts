import { prisma } from "@/lib/db/prisma";
import type { CredentialSchema } from "@/generated/prisma";

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
  data: Omit<CredentialSchema, "id" | "isActive" | "createdAt" | "updatedAt">,
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
  data: Partial<
    Omit<
      CredentialSchema,
      "id" | "universityProfileId" | "createdAt" | "updatedAt"
    >
  >,
) {
  return prisma.credentialSchema.update({
    where: { id },
    data,
  });
}
