import "server-only";

import { z } from "zod";

import { AuditAction, VendorApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { hasPrismaErrorCode, runSerializableTransaction } from "@/lib/db/transaction";

const ACTIVE_APPLICATION_STATUSES = [
  VendorApplicationStatus.PENDING,
  VendorApplicationStatus.APPROVED,
] as const;

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
});

const revokeApplicationSchema = z.object({
  applicationId: z.string().trim().min(1),
  reviewerId: z.string().trim().min(1),
  notes: z.string().trim().min(1, "A revocation reason is required").max(500),
});

export type CreateVendorApplicationInput = z.input<typeof createApplicationSchema>;

function activeApplicationError(status?: VendorApplicationStatus) {
  return status === VendorApplicationStatus.APPROVED
    ? new Error("Your verifier application is already approved.")
    : new Error("You already have an application under review.");
}

/**
 * Stores a verifier application as an immutable snapshot. The live vendor
 * profile is only updated after an administrator approves the application.
 */
export async function createVendorApplication({
  userId,
  input,
}: {
  userId: string;
  input: CreateVendorApplicationInput;
}) {
  const data = createApplicationSchema.parse(input);

  try {
    return await runSerializableTransaction(async (transaction) => {
      const vendorProfile = await transaction.vendorProfile.findUnique({
        where: { userId },
      });

      if (!vendorProfile) {
        throw new Error("No vendor profile found for this account.");
      }

      const existingApplication = await transaction.vendorApplication.findFirst({
        where: {
          vendorProfileId: vendorProfile.id,
          status: { in: [...ACTIVE_APPLICATION_STATUSES] },
        },
        select: { status: true },
      });

      if (existingApplication) {
        throw activeApplicationError(existingApplication.status);
      }

      const application = await transaction.vendorApplication.create({
        data: {
          vendorProfileId: vendorProfile.id,
          justification: data.justification,
          companyRegistrationNumber: data.companyRegistrationNumber,
          snapshotCompanyName: data.companyName,
          snapshotServiceCategory: data.serviceCategory,
          snapshotContactEmail: data.contactEmail,
          snapshotContactPersonName: data.contactPersonName,
          snapshotWebsite: data.website || null,
          snapshotDescription: data.description,
        },
      });

      await writeAuditLog(
        {
          action: AuditAction.VENDOR_APPLICATION_SUBMITTED,
          actorId: userId,
          targetType: "vendor_application",
          targetId: application.id,
          meta: { vendorProfileId: vendorProfile.id },
        },
        transaction,
      );

      return application;
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      throw activeApplicationError();
    }

    throw error;
  }
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
    include: { vendorProfile: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVendorApplicationById(applicationId: string) {
  return prisma.vendorApplication.findUnique({
    where: { id: applicationId },
    include: {
      vendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
          website: true,
          description: true,
          contactPersonName: true,
          contactEmail: true,
        },
      },
    },
  });
}

export async function listVendorApplications({
  status,
}: {
  status?: VendorApplicationStatus | VendorApplicationStatus[];
} = {}) {
  const where = status
    ? Array.isArray(status)
      ? { status: { in: status } }
      : { status }
    : undefined;

  return prisma.vendorApplication.findMany({
    where,
    include: {
      vendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
          contactEmail: true,
          contactPersonName: true,
          website: true,
          description: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listDecidedVendorApplications() {
  const applications = await prisma.vendorApplication.findMany({
    where: {
      status: {
        in: [
          VendorApplicationStatus.APPROVED,
          VendorApplicationStatus.REJECTED,
          VendorApplicationStatus.REVOKED,
        ],
      },
    },
    include: {
      vendorProfile: {
        select: { companyName: true, serviceCategory: true },
      },
    },
  });

  const actorIds = [
    ...new Set(
      applications
        .flatMap((application) => [
          application.reviewedByUserId,
          application.revokedByUserId,
        ])
        .filter(Boolean),
    ),
  ] as string[];

  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
  const actorMap = Object.fromEntries(actors.map((actor) => [actor.id, actor.name]));

  return applications
    .map((application) => {
      const isRevoked = application.status === VendorApplicationStatus.REVOKED;
      const decisionActorId = isRevoked
        ? application.revokedByUserId
        : application.reviewedByUserId;

      return {
        ...application,
        decisionActorName: decisionActorId
          ? (actorMap[decisionActorId] ?? null)
          : null,
        decisionAt: isRevoked ? application.revokedAt : application.reviewedAt,
        decisionNotes: isRevoked
          ? application.revokedNotes
          : application.reviewNotes,
        companyName:
          application.snapshotCompanyName ?? application.vendorProfile.companyName,
        serviceCategory:
          application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory,
      };
    })
    .sort(
      (left, right) =>
        (right.decisionAt?.getTime() ?? 0) - (left.decisionAt?.getTime() ?? 0),
    );
}

/** Removes verifier privileges while leaving the vendor account available. */
export async function revokeVendorApplication(input: {
  applicationId: string;
  reviewerId: string;
  notes: string;
}) {
  const data = revokeApplicationSchema.parse(input);

  return runSerializableTransaction(async (transaction) => {
    const result = await transaction.vendorApplication.updateMany({
      where: {
        id: data.applicationId,
        status: VendorApplicationStatus.APPROVED,
      },
      data: {
        status: VendorApplicationStatus.REVOKED,
        revokedByUserId: data.reviewerId,
        revokedAt: new Date(),
        revokedNotes: data.notes,
      },
    });

    if (result.count !== 1) {
      throw new Error("This vendor is not currently approved.");
    }

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_APPLICATION_REVOKED,
        actorId: data.reviewerId,
        targetType: "vendor_application",
        targetId: data.applicationId,
        meta: { notes: data.notes },
      },
      transaction,
    );
  });
}

/** Approves or rejects a pending application and records the decision atomically. */
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
  const normalizedNotes = notes?.trim();
  if (decision === VendorApplicationStatus.REJECTED && !normalizedNotes) {
    throw new Error("A rejection reason is required.");
  }

  try {
    return await runSerializableTransaction(async (transaction) => {
      const application = await transaction.vendorApplication.findUnique({
        where: { id: applicationId },
        include: { vendorProfile: true },
      });

      if (!application || application.status !== VendorApplicationStatus.PENDING) {
        throw new Error("This application is not pending review.");
      }

      const result = await transaction.vendorApplication.updateMany({
        where: { id: applicationId, status: VendorApplicationStatus.PENDING },
        data: {
          status: decision,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          reviewNotes: normalizedNotes || null,
        },
      });

      if (result.count !== 1) {
        throw new Error("This application is not pending review.");
      }

      if (decision === VendorApplicationStatus.APPROVED) {
        await transaction.vendorProfile.update({
          where: { id: application.vendorProfileId },
          data: {
            companyName:
              application.snapshotCompanyName ?? application.vendorProfile.companyName,
            serviceCategory:
              application.snapshotServiceCategory ?? application.vendorProfile.serviceCategory,
            contactEmail:
              application.snapshotContactEmail ?? application.vendorProfile.contactEmail,
            contactPersonName:
              application.snapshotContactPersonName ??
              application.vendorProfile.contactPersonName,
            website: application.snapshotWebsite,
            description:
              application.snapshotDescription ?? application.vendorProfile.description,
          },
        });
      }

      await writeAuditLog(
        {
          action:
            decision === VendorApplicationStatus.APPROVED
              ? AuditAction.VENDOR_APPLICATION_APPROVED
              : AuditAction.VENDOR_APPLICATION_REJECTED,
          actorId: reviewerId,
          targetType: "vendor_application",
          targetId: applicationId,
          meta: normalizedNotes ? { notes: normalizedNotes } : undefined,
        },
        transaction,
      );

      return transaction.vendorApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) {
      throw new Error("This vendor already has an active verifier application.");
    }

    throw error;
  }
}

export async function markApplicationViewed({
  applicationId,
}: {
  applicationId: string;
}) {
  await prisma.vendorApplication.updateMany({
    where: {
      id: applicationId,
      viewedByAdminAt: null,
    },
    data: {
      viewedByAdminAt: new Date(),
    },
  });
}
