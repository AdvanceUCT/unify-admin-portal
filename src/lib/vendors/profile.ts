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

export async function updateVendorProfile({
  userId,
  input,
}: {
  userId: string;
  input: UpdateVendorProfileInput;
}) {
  const data = updateProfileSchema.parse(input);
  const currentProfile = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: { parentVendorProfileId: true },
  });

  if (currentProfile?.parentVendorProfileId) {
    throw new Error("Sub-vendor accounts cannot update parent business details.");
  }

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
