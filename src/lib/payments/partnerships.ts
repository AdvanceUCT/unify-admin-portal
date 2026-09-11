/**
 * @fileoverview Manages vendor-university partnerships and payment-acceptance review.
 * @module lib/payments/partnerships
 */

import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { AuditAction, CampusStatus, VendorApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/transaction";

type Database = Pick<
  Prisma.TransactionClient,
  "universityProfile" | "vendorUniversityPartnership"
>;

/**
 * Called when a vendor's verifier application is approved (see
 * `reviewVendorApplication` in `lib/vendors/applications.ts`), which now
 * collects campusStatus as part of that same approval. Creates the
 * partnership row for this deployment's single university if one doesn't
 * already exist, and sets campusStatus on it either way — the admin's
 * selection at approval time takes precedence over whatever was there
 * before (e.g. a stale value from an earlier rejected/revoked cycle). Runs
 * inside the caller's transaction.
 */
export async function ensurePartnershipForApprovedVendor(
  vendorProfileId: string,
  campusStatus: CampusStatus,
  database: Database = prisma,
) {
  const university = await database.universityProfile.findFirst({ select: { id: true } });
  if (!university) return;

  await database.vendorUniversityPartnership.upsert({
    where: {
      vendorProfileId_universityProfileId: {
        vendorProfileId,
        universityProfileId: university.id,
      },
    },
    create: { vendorProfileId, universityProfileId: university.id, campusStatus },
    update: { campusStatus },
  });
}

/**
 * Finds this deployment's single partnership row for a vendor (see the
 * tenancy note on VendorUniversityPartnership in schema.prisma — there is
 * only ever one university per deployment, so "the" partnership is
 * unambiguous today even though the schema allows more than one).
 */
export async function getPartnershipForVendor(vendorProfileId: string) {
  return prisma.vendorUniversityPartnership.findFirst({
    where: { vendorProfileId },
    include: {
      paymentApplications: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function listVendorPaymentApplications({
  status,
}: {
  status?: VendorApplicationStatus | VendorApplicationStatus[];
} = {}) {
  const where = status
    ? Array.isArray(status)
      ? { status: { in: status } }
      : { status }
    : undefined;

  return prisma.vendorPaymentApplication.findMany({
    where,
    include: {
      partnership: {
        include: {
          vendorProfile: {
            select: { companyName: true, serviceCategory: true, contactEmail: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Single partnership by id, with the vendor's most recent payment application, for the detail view. */
export async function getVendorPartnershipById(partnershipId: string) {
  return prisma.vendorUniversityPartnership.findUnique({
    where: { id: partnershipId },
    include: {
      vendorProfile: {
        select: { companyName: true, serviceCategory: true, contactEmail: true },
      },
      paymentApplications: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function listVendorPartnerships() {
  return prisma.vendorUniversityPartnership.findMany({
    include: {
      vendorProfile: {
        select: { companyName: true, serviceCategory: true, contactEmail: true },
      },
      paymentApplications: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

const campusStatusSchema = z.object({
  partnershipId: z.string().trim().min(1),
  campusStatus: z.enum(["ON_CAMPUS", "OFF_CAMPUS"]),
  actorId: z.string().trim().min(1),
});

export async function setCampusStatus(input: {
  partnershipId: string;
  campusStatus: "ON_CAMPUS" | "OFF_CAMPUS";
  actorId: string;
}) {
  const data = campusStatusSchema.parse(input);

  await prisma.$transaction(async (transaction) => {
    const updated = await transaction.vendorUniversityPartnership.update({
      where: { id: data.partnershipId },
      data: { campusStatus: data.campusStatus },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_CAMPUS_STATUS_CHANGED,
        actorId: data.actorId,
        targetType: "vendor_university_partnership",
        targetId: updated.id,
        meta: { campusStatus: data.campusStatus },
      },
      transaction,
    );
  });
}

const submitPaymentApplicationSchema = z.object({
  partnershipId: z.string().trim().min(1),
  justification: z.string().trim().max(2000).optional(),
  userId: z.string().trim().min(1),
});

/** Creates or reuses a DRAFT application, then submits it (DRAFT/none -> PENDING). */
export async function submitVendorPaymentApplication(input: {
  partnershipId: string;
  justification?: string;
  userId: string;
}) {
  const data = submitPaymentApplicationSchema.parse(input);

  return runSerializableTransaction(async (transaction) => {
    const existingActive = await transaction.vendorPaymentApplication.findFirst({
      where: {
        partnershipId: data.partnershipId,
        status: { in: [VendorApplicationStatus.PENDING, VendorApplicationStatus.APPROVED] },
      },
    });

    if (existingActive) {
      throw new Error(
        existingActive.status === VendorApplicationStatus.APPROVED
          ? "This vendor's payment-acceptance request is already approved."
          : "A payment-acceptance request is already under review.",
      );
    }

    const application = await transaction.vendorPaymentApplication.create({
      data: {
        partnershipId: data.partnershipId,
        status: VendorApplicationStatus.PENDING,
        justification: data.justification || null,
      },
    });

    await transaction.vendorUniversityPartnership.update({
      where: { id: data.partnershipId },
      data: { paymentAcceptanceStatus: VendorApplicationStatus.PENDING },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_PAYMENT_APPLICATION_SUBMITTED,
        actorId: data.userId,
        targetType: "vendor_payment_application",
        targetId: application.id,
      },
      transaction,
    );

    return application;
  });
}

/** Approves or rejects a pending payment-acceptance request, denormalizing the decision onto the partnership. */
export async function reviewVendorPaymentApplication({
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

  return runSerializableTransaction(async (transaction) => {
    const application = await transaction.vendorPaymentApplication.findUnique({
      where: { id: applicationId },
      include: { partnership: { select: { campusStatus: true } } },
    });

    if (!application || application.status !== VendorApplicationStatus.PENDING) {
      throw new Error("This request is not pending review.");
    }

    // Re-read fresh here rather than trusting the value at submission time —
    // classification can change between a vendor applying and an admin
    // reviewing, and this transaction is the actual access-control gate for
    // payment acceptance, not just a workflow nicety.
    if (decision === VendorApplicationStatus.APPROVED && application.partnership.campusStatus !== CampusStatus.ON_CAMPUS) {
      throw new Error("This vendor must be classified as on-campus before payment acceptance can be approved.");
    }

    const updateResult = await transaction.vendorPaymentApplication.updateMany({
      where: { id: applicationId, status: VendorApplicationStatus.PENDING },
      data: {
        status: decision,
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: normalizedNotes || null,
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("This request is not pending review.");
    }

    await transaction.vendorUniversityPartnership.update({
      where: { id: application.partnershipId },
      data: { paymentAcceptanceStatus: decision },
    });

    await writeAuditLog(
      {
        action:
          decision === VendorApplicationStatus.APPROVED
            ? AuditAction.VENDOR_PAYMENT_APPLICATION_APPROVED
            : AuditAction.VENDOR_PAYMENT_APPLICATION_REJECTED,
        actorId: reviewerId,
        targetType: "vendor_payment_application",
        targetId: applicationId,
        meta: normalizedNotes ? { notes: normalizedNotes } : undefined,
      },
      transaction,
    );

    return transaction.vendorPaymentApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
  });
}

/** Removes payment-acceptance eligibility from a previously approved vendor. */
export async function revokeVendorPaymentApplication({
  applicationId,
  reviewerId,
  notes,
}: {
  applicationId: string;
  reviewerId: string;
  notes: string;
}) {
  const trimmedNotes = notes.trim();
  if (!trimmedNotes) {
    throw new Error("A revocation reason is required.");
  }

  return runSerializableTransaction(async (transaction) => {
    const application = await transaction.vendorPaymentApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.status !== VendorApplicationStatus.APPROVED) {
      throw new Error("This vendor is not currently approved for payment acceptance.");
    }

    const updateResult = await transaction.vendorPaymentApplication.updateMany({
      where: { id: applicationId, status: VendorApplicationStatus.APPROVED },
      data: {
        status: VendorApplicationStatus.REVOKED,
        revokedByUserId: reviewerId,
        revokedAt: new Date(),
        revokedNotes: trimmedNotes,
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("This vendor is not currently approved for payment acceptance.");
    }

    await transaction.vendorUniversityPartnership.update({
      where: { id: application.partnershipId },
      data: { paymentAcceptanceStatus: VendorApplicationStatus.REVOKED },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_PAYMENT_APPLICATION_REVOKED,
        actorId: reviewerId,
        targetType: "vendor_payment_application",
        targetId: applicationId,
        meta: { notes: trimmedNotes },
      },
      transaction,
    );
  });
}
