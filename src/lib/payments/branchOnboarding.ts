/**
 * @fileoverview Branch-level wallet payment acceptance onboarding.
 * @module lib/payments/branchOnboarding
 */

import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  BranchPaymentAcceptanceStatus,
  BranchPaymentApplicationStatus,
  CampusStatus,
  VendorBranchStatus,
  VendorPaymentProfileStatus,
  WalletAccountType,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { WALLET_CURRENCY } from "@/lib/payments/constants";

const ACTIVE_APPLICATION_STATUSES = [
  BranchPaymentApplicationStatus.DRAFT,
  BranchPaymentApplicationStatus.PENDING,
  BranchPaymentApplicationStatus.APPROVED,
] as const;

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("The transaction could not be completed.");
}

function paymentQrIdentifier(branchId: string) {
  return `pay_${branchId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

async function assertWalletEnabled(transaction: Prisma.TransactionClient) {
  const profiles = await transaction.universityProfile.findMany({
    take: 2,
    select: { paymentWalletEnabled: true },
  });

  if (profiles.length !== 1 || !profiles[0].paymentWalletEnabled) {
    throw new Error("Payment wallet functionality must be enabled before approving branch payment access.");
  }
}

const branchScopedSchema = z.object({
  vendorProfileId: z.string().trim().min(1),
  branchId: z.string().trim().min(1),
  actorId: z.string().trim().min(1),
});

const adminBranchSchema = z.object({
  branchId: z.string().trim().min(1),
  actorId: z.string().trim().min(1),
});

const reviewSchema = z.object({
  applicationId: z.string().trim().min(1),
  reviewerId: z.string().trim().min(1),
  notes: z.string().trim().max(500).optional(),
});

export async function submitBranchPaymentApplication(input: {
  vendorProfileId: string;
  branchId: string;
  actorId: string;
}) {
  const data = branchScopedSchema.parse(input);

  return runSerializableTransaction(async (transaction) => {
    const branch = await transaction.vendorBranch.findFirst({
      where: { id: data.branchId, vendorProfileId: data.vendorProfileId },
      include: {
        paymentAcceptance: true,
        paymentApplications: {
          where: { status: { in: [...ACTIVE_APPLICATION_STATUSES] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!branch) throw new Error("Branch was not found.");
    if (!branch.active || branch.status !== VendorBranchStatus.ACTIVE) {
      throw new Error("Only active branches can request wallet payment access.");
    }
    if (branch.paymentAcceptance?.status === BranchPaymentAcceptanceStatus.ACTIVE) {
      throw new Error("This branch is already approved for wallet payments.");
    }

    const existing = branch.paymentApplications[0];
    if (existing?.status === BranchPaymentApplicationStatus.APPROVED) {
      throw new Error("This branch is already approved for wallet payments.");
    }
    if (existing?.status === BranchPaymentApplicationStatus.PENDING) {
      return existing;
    }

    const application = existing?.status === BranchPaymentApplicationStatus.DRAFT
      ? await transaction.vendorBranchPaymentApplication.update({
          where: { id: existing.id },
          data: {
            status: BranchPaymentApplicationStatus.PENDING,
            submittedAt: new Date(),
          },
        })
      : await transaction.vendorBranchPaymentApplication.create({
          data: {
            vendorBranchId: branch.id,
            status: BranchPaymentApplicationStatus.PENDING,
            submittedAt: new Date(),
          },
        });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BRANCH_PAYMENT_APPLICATION_SUBMITTED,
        actorId: data.actorId,
        targetType: "vendor_branch_payment_application",
        targetId: application.id,
        meta: { branchId: branch.id, vendorProfileId: data.vendorProfileId },
      },
      transaction,
    );

    return application;
  });
}

export async function setBranchCampusStatus(input: {
  branchId: string;
  campusStatus: "ON_CAMPUS" | "OFF_CAMPUS";
  actorId: string;
}) {
  const data = adminBranchSchema.extend({
    campusStatus: z.enum([CampusStatus.ON_CAMPUS, CampusStatus.OFF_CAMPUS]),
  }).parse(input);

  return runSerializableTransaction(async (transaction) => {
    const branch = await transaction.vendorBranch.update({
      where: { id: data.branchId },
      data: { campusStatus: data.campusStatus },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BRANCH_CAMPUS_STATUS_CHANGED,
        actorId: data.actorId,
        targetType: "vendor_branch",
        targetId: branch.id,
        meta: { campusStatus: data.campusStatus },
      },
      transaction,
    );

    return branch;
  });
}

export async function approveBranchPaymentApplication(input: {
  applicationId: string;
  reviewerId: string;
  notes?: string;
}) {
  const data = reviewSchema.parse(input);

  return runSerializableTransaction(async (transaction) => {
    await assertWalletEnabled(transaction);

    const application = await transaction.vendorBranchPaymentApplication.findUnique({
      where: { id: data.applicationId },
      include: {
        vendorBranch: {
          include: {
            paymentAcceptance: true,
            vendorProfile: { select: { id: true } },
          },
        },
      },
    });

    if (!application || application.status !== BranchPaymentApplicationStatus.PENDING) {
      throw new Error("This payment-access request is not pending review.");
    }

    const branch = application.vendorBranch;
    if (!branch.active || branch.status !== VendorBranchStatus.ACTIVE) {
      throw new Error("Only active branches can be approved for wallet payments.");
    }
    if (branch.campusStatus !== CampusStatus.ON_CAMPUS) {
      throw new Error("This branch must be marked as on-campus before payment access can be approved.");
    }

    const updateResult = await transaction.vendorBranchPaymentApplication.updateMany({
      where: { id: application.id, status: BranchPaymentApplicationStatus.PENDING },
      data: {
        status: BranchPaymentApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByUserId: data.reviewerId,
        reviewNotes: data.notes?.trim() || null,
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("This payment-access request is not pending review.");
    }

    await transaction.vendorPaymentProfile.upsert({
      where: { vendorProfileId: branch.vendorProfile.id },
      create: {
        vendorProfileId: branch.vendorProfile.id,
        status: VendorPaymentProfileStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: data.reviewerId,
      },
      update: {
        status: VendorPaymentProfileStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: data.reviewerId,
        suspendedAt: null,
        suspensionReason: null,
      },
    });

    await transaction.walletAccount.upsert({
      where: { vendorProfileId: branch.vendorProfile.id },
      create: {
        type: WalletAccountType.VENDOR,
        currency: WALLET_CURRENCY,
        vendorProfileId: branch.vendorProfile.id,
      },
      update: {},
    });

    const qrIdentifier = branch.paymentAcceptance?.qrIdentifier ?? paymentQrIdentifier(branch.id);
    const acceptance = branch.paymentAcceptance
      ? await transaction.vendorBranchPaymentAcceptance.update({
          where: { vendorBranchId: branch.id },
          data: {
            approvedApplicationId: application.id,
            status: BranchPaymentAcceptanceStatus.ACTIVE,
            approvedAt: new Date(),
            suspendedAt: null,
            suspensionReason: null,
          },
        })
      : await transaction.vendorBranchPaymentAcceptance.create({
          data: {
            vendorBranchId: branch.id,
            approvedApplicationId: application.id,
            status: BranchPaymentAcceptanceStatus.ACTIVE,
            qrIdentifier,
            approvedAt: new Date(),
          },
        });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BRANCH_PAYMENT_APPLICATION_APPROVED,
        actorId: data.reviewerId,
        targetType: "vendor_branch_payment_application",
        targetId: application.id,
        meta: { branchId: branch.id, qrIdentifier },
      },
      transaction,
    );

    return acceptance;
  });
}

export async function rejectBranchPaymentApplication(input: {
  applicationId: string;
  reviewerId: string;
  notes: string;
}) {
  const data = reviewSchema.extend({
    notes: z.string().trim().min(1, "A rejection reason is required.").max(500),
  }).parse(input);

  return runSerializableTransaction(async (transaction) => {
    const application = await transaction.vendorBranchPaymentApplication.findUnique({
      where: { id: data.applicationId },
      select: { id: true, status: true, vendorBranchId: true },
    });

    if (!application || application.status !== BranchPaymentApplicationStatus.PENDING) {
      throw new Error("This payment-access request is not pending review.");
    }

    const updateResult = await transaction.vendorBranchPaymentApplication.updateMany({
      where: { id: application.id, status: BranchPaymentApplicationStatus.PENDING },
      data: {
        status: BranchPaymentApplicationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByUserId: data.reviewerId,
        reviewNotes: data.notes,
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("This payment-access request is not pending review.");
    }

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BRANCH_PAYMENT_APPLICATION_REJECTED,
        actorId: data.reviewerId,
        targetType: "vendor_branch_payment_application",
        targetId: application.id,
        meta: { branchId: application.vendorBranchId, notes: data.notes },
      },
      transaction,
    );
  });
}

export async function closeBranchPaymentAcceptance(input: {
  branchId: string;
  actorId: string;
  notes: string;
}) {
  const data = adminBranchSchema.extend({
    notes: z.string().trim().min(1, "A closure reason is required.").max(500),
  }).parse(input);

  return runSerializableTransaction(async (transaction) => {
    const acceptance = await transaction.vendorBranchPaymentAcceptance.findUnique({
      where: { vendorBranchId: data.branchId },
      include: { approvedApplication: true },
    });

    if (!acceptance || acceptance.status === BranchPaymentAcceptanceStatus.CLOSED) {
      throw new Error("This branch is not currently approved for wallet payments.");
    }

    await transaction.vendorBranchPaymentAcceptance.update({
      where: { vendorBranchId: data.branchId },
      data: {
        status: BranchPaymentAcceptanceStatus.CLOSED,
        suspendedAt: new Date(),
        suspensionReason: data.notes,
      },
    });

    await transaction.vendorBranchPaymentApplication.update({
      where: { id: acceptance.approvedApplicationId },
      data: {
        status: BranchPaymentApplicationStatus.REVOKED,
        reviewedAt: acceptance.approvedApplication.reviewedAt,
        reviewedByUserId: acceptance.approvedApplication.reviewedByUserId,
        reviewNotes: acceptance.approvedApplication.reviewNotes,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BRANCH_PAYMENT_ACCEPTANCE_CLOSED,
        actorId: data.actorId,
        targetType: "vendor_branch_payment_acceptance",
        targetId: acceptance.id,
        meta: { branchId: data.branchId, notes: data.notes },
      },
      transaction,
    );
  });
}

export async function getBranchPaymentAccessDetail(branchId: string) {
  return prisma.vendorBranch.findUnique({
    where: { id: branchId },
    include: {
      vendorProfile: {
        select: { companyName: true, serviceCategory: true, contactEmail: true },
      },
      paymentAcceptance: {
        include: { approvedApplication: true },
      },
      paymentApplications: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

export async function listBranchPaymentAccessQueue() {
  const [pendingApplications, activeAcceptances, recentDecisions] = await Promise.all([
    prisma.vendorBranchPaymentApplication.findMany({
      where: { status: BranchPaymentApplicationStatus.PENDING },
      include: {
        vendorBranch: {
          include: {
            vendorProfile: {
              select: { companyName: true, serviceCategory: true, contactEmail: true },
            },
          },
        },
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.vendorBranchPaymentAcceptance.findMany({
      where: { status: BranchPaymentAcceptanceStatus.ACTIVE },
      include: {
        vendorBranch: {
          include: {
            vendorProfile: {
              select: { companyName: true, serviceCategory: true, contactEmail: true },
            },
          },
        },
      },
      orderBy: { approvedAt: "desc" },
    }),
    prisma.vendorBranchPaymentApplication.findMany({
      where: {
        status: {
          in: [
            BranchPaymentApplicationStatus.APPROVED,
            BranchPaymentApplicationStatus.REJECTED,
            BranchPaymentApplicationStatus.REVOKED,
            BranchPaymentApplicationStatus.WITHDRAWN,
          ],
        },
      },
      include: {
        vendorBranch: {
          include: {
            vendorProfile: {
              select: { companyName: true, serviceCategory: true, contactEmail: true },
            },
          },
        },
      },
      orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
  ]);

  return { pendingApplications, activeAcceptances, recentDecisions };
}
