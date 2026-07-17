"use server";

import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const createVendorProfileSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  serviceCategory: z.string().trim().min(1, "Service category is required"),
});

export type CreateVendorProfileInput = z.input<typeof createVendorProfileSchema>;

export type CreateVendorProfileResult =
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Creates the vendor profile row right after a vendor signs up. The signup
 * form only collects auth fields (name, email, password) plus these two
 * profile fields, so this runs as a follow-up server action rather than a
 * Better Auth `user.create.after` hook, which has no access to the form data.
 *
 * Navigation after signup (showing the success message, then redirecting to
 * the dashboard) is handled by the caller, not here — this only reports
 * whether the profile row was saved.
 */
export async function createVendorProfileAction(
  input: CreateVendorProfileInput,
): Promise<CreateVendorProfileResult> {
  const session = await requireVendorSession();

  try {
    const data = createVendorProfileSchema.parse(input);

    await prisma.vendorProfile.create({
      data: {
        userId: session.user.id,
        companyName: data.companyName,
        serviceCategory: data.serviceCategory,
        contactEmail: session.user.email,
      },
    });

    await writeAuditLog({
      action: AuditAction.VENDOR_SIGNUP,
      actorId: session.user.id,
      targetType: "user",
      targetId: session.user.id,
      meta: {
        companyName: data.companyName,
        serviceCategory: data.serviceCategory,
      },
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to save your company details.",
    };
  }

  return { status: "success" };
}
