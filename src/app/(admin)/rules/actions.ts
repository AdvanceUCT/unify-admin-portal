"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getUniversityProfile } from "@/lib/university/profile";

const renewalSettingsSchema = z.object({
  defaultCredentialValidityDays: z.coerce.number().int().min(1).max(3650),
  renewalCadenceMonths: z.coerce.number().int().min(1).max(120),
});

export async function saveRenewalSettingsAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const parsed = renewalSettingsSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    throw new Error("Validity days and renewal cadence must be valid positive numbers.");
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("University profile was not found.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.universityProfile.update({
      data: parsed.data,
      where: { id: profile.id },
    });

    await transaction.auditLog.create({
      data: {
        action: AuditAction.RENEWAL_SETTINGS_UPDATED,
        actorId: session.user.id,
        meta: parsed.data,
        targetId: profile.id,
        targetType: "UniversityProfile",
      },
    });
  });

  revalidatePath("/rules");
}
