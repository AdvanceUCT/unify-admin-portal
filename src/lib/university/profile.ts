import { prisma } from "@/lib/db/prisma";
import type { UniversityProfile } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";
import { RENEWAL_CADENCE_PRESETS, type RenewalCadenceMonths } from "@/lib/credentials/renewalCadence";
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
 * Updates the global renewal cadence. `months: null` turns auto-renewal off.
 *
 * @throws If `months` isn't one of `RENEWAL_CADENCE_PRESETS` or `null`.
 */
export async function updateRenewalCadence({
  actorId,
  months,
}: {
  actorId?: string | null;
  months: RenewalCadenceMonths | null;
}) {
  if (months !== null && !RENEWAL_CADENCE_PRESETS.includes(months)) {
    throw new Error(`Renewal cadence must be one of ${RENEWAL_CADENCE_PRESETS.join(", ")} months, or off.`);
  }

  const existingProfile = await getUniversityProfile();
  if (!existingProfile) {
    throw new Error("University profile has not been configured.");
  }

  const profile = await prisma.universityProfile.update({
    data: { renewalCadenceMonths: months },
    where: { id: existingProfile.id },
  });

  await writeAuditLog({
    action: AuditAction.RENEWAL_CADENCE_UPDATED,
    actorId,
    meta: { renewalCadenceMonths: months },
    targetId: profile.id,
    targetType: "university_profile",
  });

  return profile;
}
