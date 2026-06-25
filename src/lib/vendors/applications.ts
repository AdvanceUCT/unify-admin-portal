import "server-only";

import { z } from "zod";

import { AuditAction, VendorApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";

const createApplicationSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  companyRegistrationNumber: z.string().trim().min(1, "Company registration number is required"),
  serviceCategory: z.string().trim().min(1, "Service category is required"),
  website: z.string().trim().url("Website must be a valid URL").optional().or(z.literal("")),
  description: z
    .string()
    .trim()
    .min(1, "Service description is required")
    .refine(
      (value) => value.split(/\s+/).filter(Boolean).length <= 200,
      "Description must be 200 words or fewer",
    ),
  contactPersonName: z.string().trim().min(1, "Contact person name is required"),
  contactEmail: z.string().trim().email("Contact email must be valid"),
  justification: z.string().trim().min(1, "Justification is required"),
  requestedScopes: z.array(z.string().trim().min(1)).default([]),
});

export type CreateVendorApplicationInput = z.input<typeof createApplicationSchema>;

/**
 * Submits a new verifier application for the vendor's profile. Vendors can
 * only have one open (pending) application at a time — they must wait for a
 * decision before submitting another.
 *
 * @throws If the user has no vendor profile, or already has a pending application.
 */
export async function createVendorApplication({
  userId,
  input,
}: {
  userId: string;
  input: CreateVendorApplicationInput;
}) {
  const data = createApplicationSchema.parse(input);

  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId },
  });

  if (!vendorProfile) {
    throw new Error("No vendor profile found for this account.");
  }

  const existingPendingApplication = await prisma.vendorApplication.findFirst({
    where: {
      vendorProfileId: vendorProfile.id,
      status: VendorApplicationStatus.PENDING,
    },
  });

  if (existingPendingApplication) {
    throw new Error("You already have an application under review.");
  }

  await prisma.vendorProfile.update({
    where: { id: vendorProfile.id },
    data: {
      companyName: data.companyName,
      serviceCategory: data.serviceCategory,
      contactEmail: data.contactEmail,
      website: data.website || null,
      description: data.description,
      contactPersonName: data.contactPersonName,
    },
  });

  const application = await prisma.vendorApplication.create({
    data: {
      vendorProfileId: vendorProfile.id,
      justification: data.justification,
      requestedScopes: data.requestedScopes,
      companyRegistrationNumber: data.companyRegistrationNumber,
    },
  });

  await writeAuditLog({
    action: AuditAction.VENDOR_APPLICATION_SUBMITTED,
    actorId: userId,
    targetType: "vendor_application",
    targetId: application.id,
    meta: {
      vendorProfileId: vendorProfile.id,
    },
  });

  return application;
}

export async function getVendorApplicationForUser(userId: string) {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId },
  });

  if (!vendorProfile) {
    return null;
  }

  return prisma.vendorApplication.findFirst({
    where: { vendorProfileId: vendorProfile.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function listVendorApplications({
  status,
}: {
  status?: VendorApplicationStatus;
} = {}) {
  return prisma.vendorApplication.findMany({
    where: status ? { status } : undefined,
    include: {
      vendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
          contactEmail: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Approves or rejects a pending vendor application. Only pending
 * applications can be reviewed — a decision is final.
 *
 * @throws If the application doesn't exist or isn't pending.
 */
export async function reviewVendorApplication({
  applicationId,
  decision,
  reviewerId,
  notes,
}: {
  applicationId: string;
  decision: "APPROVED" | "REJECTED";
  reviewerId: string;
  notes?: string;
}) {
  const result = await prisma.vendorApplication.updateMany({
    where: {
      id: applicationId,
      status: VendorApplicationStatus.PENDING,
    },
    data: {
      status: decision,
      reviewedByUserId: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });

  if (result.count !== 1) {
    throw new Error("This application is not pending review.");
  }

  await writeAuditLog({
    action:
      decision === "APPROVED"
        ? AuditAction.VENDOR_APPLICATION_APPROVED
        : AuditAction.VENDOR_APPLICATION_REJECTED,
    actorId: reviewerId,
    targetType: "vendor_application",
    targetId: applicationId,
    meta: notes ? { notes } : undefined,
  });

  return prisma.vendorApplication.findUniqueOrThrow({
    where: { id: applicationId },
  });
}
