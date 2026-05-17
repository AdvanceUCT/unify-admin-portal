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

