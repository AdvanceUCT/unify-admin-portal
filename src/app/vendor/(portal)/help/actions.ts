/**
 * @fileoverview Contains the server actions used by the `/vendor/help` workflow.
 * @module app/vendor/(portal)/help/actions
 */

"use server";

import { z } from "zod";

import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sendVendorHelpRequestEmail } from "@/lib/email/vendor-help";
import { getUniversityProfile } from "@/lib/university/profile";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";

export type VendorHelpFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const helpRequestSchema = z.object({
  details: z
    .string()
    .trim()
    .min(10, "Details must be at least 10 characters.")
    .max(5_000, "Details must be 5,000 characters or fewer."),
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters.")
    .max(160, "Title must be 160 characters or fewer."),
});

export async function submitVendorHelpRequestAction(
  _previousState: VendorHelpFormState,
  formData: FormData,
): Promise<VendorHelpFormState> {
  const session = await requireVendorSession();
  const parsed = helpRequestSchema.safeParse({
    details: String(formData.get("details") ?? ""),
    title: String(formData.get("title") ?? ""),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  try {
    const [universityProfile, approvedContext] = await Promise.all([
      getUniversityProfile(),
      getApprovedVendorContextForUser(session.user.id),
    ]);
    const vendorProfile = await prisma.vendorProfile.findFirst({
      where: {
        OR: [
          { userId: session.user.id },
          ...(approvedContext ? [{ id: approvedContext.vendorProfileId }] : []),
        ],
      },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
        contactPersonName: true,
        serviceCategory: true,
      },
    });

    if (!universityProfile?.contactEmail) {
      return {
        status: "error",
        message: "The university contact email has not been configured yet.",
      };
    }

    await sendVendorHelpRequestEmail({
      details: parsed.data.details,
      submittedAt: new Date(),
      submittedBy: {
        email: session.user.email,
        name: session.user.name,
      },
      title: parsed.data.title,
      to: universityProfile.contactEmail,
      vendor: {
        companyName: approvedContext?.companyName ?? vendorProfile?.companyName,
        contactEmail: vendorProfile?.contactEmail ?? session.user.email,
        contactPersonName: vendorProfile?.contactPersonName ?? session.user.name,
        role: approvedContext?.role ?? (vendorProfile ? "OWNER" : "VENDOR"),
        serviceCategory: vendorProfile?.serviceCategory,
      },
    });

    return {
      status: "success",
      message: `Help request sent. ${universityProfile.name} support will continue the conversation by email.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to send your help request.",
    };
  }
}
