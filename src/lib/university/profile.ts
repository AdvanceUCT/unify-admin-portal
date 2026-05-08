import { prisma } from "@/lib/db/prisma";
import type { UniversityProfile } from "@/generated/prisma/client";

/**
 * Retrieves the first university profile found in the database.
 * In a multi-tenant system this would be scoped, but for this PoC,
 * we assume a single university profile for the entire deployment.
 *
 * @returns The university profile, or null if none exists.
 */
export async function getUniversityProfile(): Promise<UniversityProfile | null> {
  return prisma.universityProfile.findFirst();
}

/**
 * Creates or updates the university profile.
 *
 * @param data - The data for the university profile.
 * @returns The created or updated university profile.
 */
export async function upsertUniversityProfile(
  data: Pick<
    UniversityProfile,
    "name" | "abbreviation" | "logoUrl" | "contactEmail"
  >,
) {
  const existingProfile = await getUniversityProfile();
  if (existingProfile) {
    return prisma.universityProfile.update({
      where: { id: existingProfile.id },
      data,
    });
  }
  return prisma.universityProfile.create({
    data: {
      ...data,
    },
  });
}
