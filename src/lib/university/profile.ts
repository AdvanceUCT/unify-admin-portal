import { prisma } from "@/lib/db/prisma";
import type { UniversityProfile } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";


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

export async function saveUniversityProfileLogoPath(
  profileId: string,
  actorId: string,
  logoPath: string,
): Promise<{ previousPath: string | null }> {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.universityProfile.findUnique({
      where: { id: profileId },
      select: { id: true, logoPath: true },
    });
    if (!profile) throw new Error("No university profile found.");

    await transaction.universityProfile.update({
      where: { id: profile.id },
      data: { logoPath },
    });
    await writeAuditLog(
      {
        action: AuditAction.SETTINGS_UPDATED,
        actorId,
        targetType: "UniversityProfile",
        targetId: profile.id,
        meta: { field: "logoPath", operation: "set", section: "university_profile" },
      },
      transaction,
    );

    return { previousPath: profile.logoPath };
  });
}

export async function removeUniversityProfileLogo(
  profileId: string,
  actorId: string,
): Promise<{ removedPath: string | null }> {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.universityProfile.findUnique({
      where: { id: profileId },
      select: { id: true, logoPath: true },
    });
    if (!profile) throw new Error("No university profile found.");
    if (!profile.logoPath) return { removedPath: null };

    await transaction.universityProfile.update({
      where: { id: profile.id },
      data: { logoPath: null },
    });
    await writeAuditLog(
      {
        action: AuditAction.SETTINGS_UPDATED,
        actorId,
        targetType: "UniversityProfile",
        targetId: profile.id,
        meta: { field: "logoPath", operation: "clear", section: "university_profile" },
      },
      transaction,
    );

    return { removedPath: profile.logoPath };
  });
}
