import { prisma } from "@/lib/db/prisma";
import type { UniversityProfile } from "@/generated/prisma/client";


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

/**
 * Updates an existing university profile's editable settings fields.
 *
 * @param id - The ID of the university profile to update.
 * @param data - The fields to update.
 * @returns The updated university profile.
 */
export async function updateUniversityProfile(
  id: string,
  data: Pick<UniversityProfile, "name" | "abbreviation" | "contactEmail" | "websiteUrl">,
) {
  return prisma.universityProfile.update({
    where: { id },
    data,
  });
}
