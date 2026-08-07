import "server-only";

import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";

const updateProfileSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  serviceCategory: z.string().trim().min(1, "Service category is required"),
  contactPersonName: z.string().trim().min(1, "Contact person name is required"),
  contactEmail: z.string().trim().email("Contact email must be valid"),
});

export type UpdateVendorProfileInput = z.input<typeof updateProfileSchema>;

export async function getVendorProfileForUser(userId: string) {
  return prisma.vendorProfile.findUnique({ where: { userId } });
}

export async function getVendorProfileLogoPath(vendorProfileId: string) {
  const profile = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    select: { logoPath: true },
  });
  return profile?.logoPath ?? null;
}

export async function updateVendorProfile({
  userId,
  input,
}: {
  userId: string;
  input: UpdateVendorProfileInput;
}) {
  const data = updateProfileSchema.parse(input);

  const profile = await prisma.vendorProfile.update({
    where: { userId },
    data,
  });

  await writeAuditLog({
    action: AuditAction.VENDOR_PROFILE_UPDATED,
    actorId: userId,
    targetType: "vendorProfile",
    targetId: profile.id,
    meta: data,
  });

  return profile;
}

export async function saveVendorProfileLogoPath(
  userId: string,
  logoPath: string,
): Promise<{ previousPath: string | null }> {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.vendorProfile.findUnique({
      where: { userId },
      select: { id: true, logoPath: true },
    });
    if (!profile) throw new Error("No vendor profile found for this account.");

    await transaction.vendorProfile.update({
      where: { id: profile.id },
      data: { logoPath },
    });
    await writeAuditLog(
      {
        action: AuditAction.VENDOR_PROFILE_UPDATED,
        actorId: userId,
        targetType: "vendorProfile",
        targetId: profile.id,
        meta: { field: "logoPath", operation: "set" },
      },
      transaction,
    );

    return { previousPath: profile.logoPath };
  });
}

export async function removeVendorProfileLogo(
  userId: string,
): Promise<{ removedPath: string | null }> {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.vendorProfile.findUnique({
      where: { userId },
      select: { id: true, logoPath: true },
    });
    if (!profile) throw new Error("No vendor profile found for this account.");
    if (!profile.logoPath) return { removedPath: null };

    await transaction.vendorProfile.update({
      where: { id: profile.id },
      data: { logoPath: null },
    });
    await writeAuditLog(
      {
        action: AuditAction.VENDOR_PROFILE_UPDATED,
        actorId: userId,
        targetType: "vendorProfile",
        targetId: profile.id,
        meta: { field: "logoPath", operation: "clear" },
      },
      transaction,
    );

    return { removedPath: profile.logoPath };
  });
}
