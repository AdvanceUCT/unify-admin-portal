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
  VendorBranchStatus,
  VendorPaymentProfileStatus,
  WalletAccountType,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { WALLET_CURRENCY } from "@/lib/payments/constants";
import type { ApprovedVendorContext } from "@/lib/vendors/context";
import { decryptVendorSecret } from "@/lib/vendors/integrationCrypto";

import { PAYMENT_ACCESS_ACKNOWLEDGEMENT } from "./paymentAccessSummary";

const ACTIVE_APPLICATION_STATUSES = [
  BranchPaymentApplicationStatus.DRAFT,
  BranchPaymentApplicationStatus.PENDING,
  BranchPaymentApplicationStatus.APPROVED,
] as const;

export const PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT = PAYMENT_ACCESS_ACKNOWLEDGEMENT;

type SafePayoutDestinationSnapshot = {
  accountHolderName?: string | null;
  accountMask?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  createdAt?: string | null;
  provider: string;
  providerAccountName?: string | null;
  recipientCode?: string | null;
};

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
      if ((!hasPrismaErrorCode(error, "P2034") && !hasPrismaErrorCode(error, "P2002")) || attempt === 2) {
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

const submitSchema = branchScopedSchema.extend({
  expectedPayoutReference: z.string().trim().min(1, "Reload the saved payout account before submitting."),
  acknowledgementAccepted: z.literal(true, {
    error: "The student transaction data acknowledgement is required.",
  }),
});

function parsePayoutDestinationSnapshot(value: string | null | undefined): SafePayoutDestinationSnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decryptVendorSecret(value)) as SafePayoutDestinationSnapshot;
    if (!parsed || typeof parsed !== "object" || typeof parsed.provider !== "string") {
      return null;
    }

    return {
      provider: parsed.provider,
      recipientCode: typeof parsed.recipientCode === "string" ? parsed.recipientCode : null,
      accountHolderName: typeof parsed.accountHolderName === "string" ? parsed.accountHolderName : null,
      accountMask: typeof parsed.accountMask === "string" ? parsed.accountMask : null,
      bankCode: typeof parsed.bankCode === "string" ? parsed.bankCode : null,
      bankName: typeof parsed.bankName === "string" ? parsed.bankName : null,
      providerAccountName:
        typeof parsed.providerAccountName === "string" ? parsed.providerAccountName : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null,
    };
  } catch {
    return null;
  }
}

function maskedAuditSnapshot(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(["provider", "accountHolderName", "accountMask", "bankCode", "bankName", "providerAccountName"].map(key => [key, typeof value[key] === "string" ? value[key] : null]));
}

export function applicationHasPaymentDetails(application: {
  payoutDestinationReferenceSnapshot: string | null;
  payoutDestinationSnapshot: Prisma.JsonValue | null;
  studentDataAcknowledgedAt: Date | null;
  studentDataAcknowledgementText: string | null;
}) {
  return Boolean(
    application.payoutDestinationReferenceSnapshot &&
      application.payoutDestinationSnapshot &&
      application.studentDataAcknowledgedAt &&
      application.studentDataAcknowledgementText === PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
  );
}

async function currentPayoutSnapshot(
  transaction: Prisma.TransactionClient,
  vendorProfileId: string,
) {
  const profile = await transaction.vendorPaymentProfile.findUnique({
    where: { vendorProfileId },
    select: {
      payoutDestinationCiphertext: true,
      payoutDestinationReference: true,
      payoutProvider: true,
    },
  });

  if (!profile?.payoutProvider || !profile.payoutDestinationReference || !profile.payoutDestinationCiphertext) {
    throw new Error("Save a payout destination before requesting payment access.");
  }

  const snapshot = parsePayoutDestinationSnapshot(profile.payoutDestinationCiphertext);
  if (!snapshot) {
    throw new Error("Unable to read the saved payout destination. Save it again before requesting payment access.");
  }

  return {
    payoutProviderSnapshot: profile.payoutProvider,
    payoutDestinationReferenceSnapshot: profile.payoutDestinationReference,
    payoutDestinationSnapshot: snapshot,
  };
}

export async function submitBranchPaymentApplication(input: {
  vendorProfileId: string;
  branchId: string;
  actorId: string;
  acknowledgementAccepted: boolean;
  expectedPayoutReference: string;
  reconfirmApplicationId?: string;
}) {
  const data = submitSchema.extend({ reconfirmApplicationId: z.string().min(1).optional() }).parse(input);

  return runSerializableTransaction(async (transaction) => {
    const branch = await transaction.vendorBranch.findFirst({
      where: { id: data.branchId, vendorProfileId: data.vendorProfileId },
      include: {
        vendorProfile: { select: { applications: { where: { status: "APPROVED" }, take: 1, select: { id: true } } } },
        paymentAcceptance: true,
        paymentApplications: {
          where: { status: { in: [...ACTIVE_APPLICATION_STATUSES] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!branch) throw new Error("Branch was not found.");
    if (!branch.vendorProfile.applications.length) throw new Error("Vendor approval is required before requesting payments.");
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
    const snapshot = await currentPayoutSnapshot(transaction, data.vendorProfileId);
    if (snapshot.payoutDestinationReferenceSnapshot !== data.expectedPayoutReference) {
      throw new Error("The payout account changed. Reload and confirm the current account.");
    }
    if (data.reconfirmApplicationId && (existing?.id !== data.reconfirmApplicationId || existing.status !== "PENDING")) {
      throw new Error("This request has already changed. Reload its current status.");
    }
    if (existing?.status === BranchPaymentApplicationStatus.PENDING) {
      const matches = existing.payoutDestinationReferenceSnapshot === snapshot.payoutDestinationReferenceSnapshot &&
        existing.payoutProviderSnapshot === snapshot.payoutProviderSnapshot;
      if (applicationHasPaymentDetails(existing) && matches) return existing;
      if (!data.reconfirmApplicationId) throw new Error("Review and confirm the updated payout account for this pending request.");
      const updated = await transaction.vendorBranchPaymentApplication.update({
        where: { id: existing.id },
        data: { ...snapshot, studentDataAcknowledgedAt: new Date(), studentDataAcknowledgementText: PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT },
      });
      // Safe snapshots are retained as JSON strings because audit metadata is scalar-only.
      await writeAuditLog({ action: AuditAction.VENDOR_BRANCH_PAYMENT_APPLICATION_SUBMITTED, actorId: data.actorId,
        targetType: "vendor_branch_payment_application", targetId: existing.id,
        meta: { branchId: branch.id, vendorProfileId: data.vendorProfileId, kind: "PAYOUT_RECONFIRMED",
          previousSnapshot: JSON.stringify(maskedAuditSnapshot(existing.payoutDestinationSnapshot)),
          previousReference: existing.payoutDestinationReferenceSnapshot, nextReference: snapshot.payoutDestinationReferenceSnapshot,
          nextSnapshot: JSON.stringify(snapshot.payoutDestinationSnapshot) } }, transaction);
      return updated;
    }

    const application = existing?.status === BranchPaymentApplicationStatus.DRAFT
      ? await transaction.vendorBranchPaymentApplication.update({
          where: { id: existing.id },
          data: {
            ...snapshot,
            status: BranchPaymentApplicationStatus.PENDING,
            studentDataAcknowledgedAt: new Date(),
            studentDataAcknowledgementText: PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
            submittedAt: new Date(),
          },
        })
      : await transaction.vendorBranchPaymentApplication.create({
          data: {
            ...snapshot,
            vendorBranchId: branch.id,
            status: BranchPaymentApplicationStatus.PENDING,
            studentDataAcknowledgedAt: new Date(),
            studentDataAcknowledgementText: PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
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

export async function approveBranchPaymentApplication(input: {
  applicationId: string;
  reviewerId: string;
  notes?: string;
  expectedPayoutReference: string;
}) {
  const data = reviewSchema.extend({ expectedPayoutReference: z.string().min(1, "Reload the payout account before reviewing.") }).parse(input);

  const result = await runSerializableTransaction(async (transaction) => {

    const application = await transaction.vendorBranchPaymentApplication.findUnique({
      where: { id: data.applicationId },
      include: {
        vendorBranch: {
          include: {
            paymentAcceptance: true,
            vendorProfile: { select: { id: true, companyName: true, contactEmail: true, applications: { where: { status: "APPROVED" }, take: 1, select: { id: true } } } },
          },
        },
      },
    });

    if (application?.status === "APPROVED" && application.vendorBranch.paymentAcceptance?.approvedApplicationId === application.id) {
      return { acceptance: application.vendorBranch.paymentAcceptance, notification: null };
    }
    if (!application || application.status !== BranchPaymentApplicationStatus.PENDING) {
      throw new Error("This payment-access request is not pending review.");
    }
    await assertWalletEnabled(transaction);
    const branch = application.vendorBranch;
    if (!branch.vendorProfile.applications.length) throw new Error("Vendor approval is no longer active.");
    if (!branch.active || branch.status !== VendorBranchStatus.ACTIVE) {
      throw new Error("Only active branches can be approved for wallet payments.");
    }
    if (!applicationHasPaymentDetails(application)) {
      throw new Error("This payment-access request is missing its payout destination or student data acknowledgement.");
    }

    const snapshot = await currentPayoutSnapshot(transaction, branch.vendorProfile.id);
    if (data.expectedPayoutReference !== snapshot.payoutDestinationReferenceSnapshot || application.payoutDestinationReferenceSnapshot !== snapshot.payoutDestinationReferenceSnapshot ||
        application.payoutProviderSnapshot !== snapshot.payoutProviderSnapshot) {
      throw new Error("The payout account changed. The owner must reconfirm it before approval.");
    }
    const paymentProfile = await transaction.vendorPaymentProfile.findUnique({ where: { vendorProfileId: branch.vendorProfile.id } });

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
      update: paymentProfile?.status === VendorPaymentProfileStatus.SUSPENDED ? {} : {
        status: VendorPaymentProfileStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: data.reviewerId,
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

    return { acceptance, notification: { applicationId: application.id, branchId: branch.id,
      branchName: branch.name, to: branch.vendorProfile.contactEmail, companyName: branch.vendorProfile.companyName,
      approved: true } };
  });
  if (result.notification) await notifyPaymentAccessDecision(result.notification);
  return result.acceptance;
}

export async function rejectBranchPaymentApplication(input: {
  applicationId: string;
  reviewerId: string;
  notes: string;
}) {
  const data = reviewSchema.extend({
    notes: z.string().trim().min(1, "A rejection reason is required.").max(500),
  }).parse(input);

  const notification = await runSerializableTransaction(async (transaction) => {
    const application = await transaction.vendorBranchPaymentApplication.findUnique({
      where: { id: data.applicationId },
      include: { vendorBranch: { include: { vendorProfile: { select: { companyName: true, contactEmail: true } } } } },
    });

    if (application?.status === "REJECTED") return null;
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
    return { applicationId: application.id, branchId: application.vendorBranchId, branchName: application.vendorBranch.name,
      to: application.vendorBranch.vendorProfile.contactEmail, companyName: application.vendorBranch.vendorProfile.companyName, approved: false };
  });
  if (notification) await notifyPaymentAccessDecision(notification);
}

export async function revokeBranchPaymentAcceptance(input: {
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
        revokedAt: new Date(),
        revokedByUserId: data.actorId,
        revokedNotes: data.notes,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.VENDOR_BRANCH_PAYMENT_ACCESS_REVOKED,
        actorId: data.actorId,
        targetType: "vendor_branch_payment_acceptance",
        targetId: acceptance.id,
        meta: { branchId: data.branchId, notes: data.notes },
      },
      transaction,
    );
  });
}

export async function getVendorPayoutDestinationSummary(vendorProfileId: string) {
  const profile = await prisma.vendorPaymentProfile.findUnique({
    where: { vendorProfileId },
    select: {
      payoutDestinationCiphertext: true,
      payoutDestinationReference: true,
      payoutProvider: true,
    },
  });

  if (!profile?.payoutProvider || !profile.payoutDestinationReference) {
    return null;
  }

  const snapshot = parsePayoutDestinationSnapshot(profile.payoutDestinationCiphertext);
  return {
    provider: profile.payoutProvider,
    reference: profile.payoutDestinationReference,
    snapshot,
  };
}

export async function listActivePaymentBranchIdsForContext(context: Pick<ApprovedVendorContext, "vendorProfileId" | "branchIds">) {
  if (context.branchIds.length === 0) return [];

  const acceptances = await prisma.vendorBranchPaymentAcceptance.findMany({
    where: {
      status: BranchPaymentAcceptanceStatus.ACTIVE,
      vendorBranchId: { in: context.branchIds },
      vendorBranch: {
        active: true,
        status: VendorBranchStatus.ACTIVE,
        vendorProfileId: context.vendorProfileId,
      },
    },
    select: { vendorBranchId: true },
  });

  return acceptances.map((acceptance) => acceptance.vendorBranchId);
}

export async function listPaymentHistoryBranchIdsForContext(context: ApprovedVendorContext) {
  if (context.branchIds.length === 0) return [];

  const branches = await prisma.vendorBranch.findMany({
    where: {
      id: { in: context.branchIds },
      vendorProfileId: context.vendorProfileId,
    },
    select: { id: true },
  });

  return branches.map((branch) => branch.id);
}

export async function listVendorPaymentAccessApplications(vendorProfileId: string) {
  return prisma.vendorBranchPaymentApplication.findMany({
    where: {
      vendorBranch: { vendorProfileId },
    },
    include: {
      vendorBranch: {
        select: {
          id: true,
          name: true,
          address: true,
          paymentAcceptance: {
            select: {
              qrIdentifier: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getBranchPaymentAccessDetail(branchId: string) {
  return prisma.vendorBranch.findUnique({
    where: { id: branchId },
    include: {
      vendorProfile: {
        select: {
          companyName: true,
          serviceCategory: true,
          contactEmail: true,
          paymentProfile: {
            select: {
              payoutDestinationReference: true,
              payoutProvider: true,
            },
          },
        },
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
              select: { id: true, companyName: true, serviceCategory: true, contactEmail: true },
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
              select: { id: true, companyName: true, serviceCategory: true, contactEmail: true },
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

export async function listPaymentAccessDecisions({
  page = 1,
  pageSize = 5,
}: {
  page?: number;
  pageSize?: number;
} = {}) {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedPageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 5;
  const where = {
    status: {
      in: [
        BranchPaymentApplicationStatus.APPROVED,
        BranchPaymentApplicationStatus.REJECTED,
        BranchPaymentApplicationStatus.REVOKED,
      ],
    },
  };

  const [totalCount, applications] = await Promise.all([
    prisma.vendorBranchPaymentApplication.count({ where }),
    prisma.vendorBranchPaymentApplication.findMany({
      where,
      include: {
        vendorBranch: {
          include: {
            vendorProfile: {
              select: { companyName: true, serviceCategory: true },
            },
          },
        },
      },
      orderBy: [
        { revokedAt: "desc" },
        { reviewedAt: "desc" },
        { createdAt: "desc" },
      ],
      skip: (normalizedPage - 1) * normalizedPageSize,
      take: normalizedPageSize,
    }),
  ]);

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
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorMap = Object.fromEntries(actors.map((actor) => [actor.id, actor.name]));

  return {
    decisions: applications.map((application) => {
      const isRevoked = application.status === BranchPaymentApplicationStatus.REVOKED;
      const actorId = isRevoked ? application.revokedByUserId : application.reviewedByUserId;

      return {
        id: application.id,
        branchName: application.vendorBranch.name,
        companyName: application.vendorBranch.vendorProfile.companyName,
        decisionActorName: actorId ? (actorMap[actorId] ?? null) : null,
        decisionAt: isRevoked ? application.revokedAt : application.reviewedAt,
        decisionNotes: isRevoked ? application.revokedNotes : application.reviewNotes,
        serviceCategory: application.vendorBranch.vendorProfile.serviceCategory,
        status: application.status,
        submittedAt: application.submittedAt ?? application.createdAt,
      };
    }),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / normalizedPageSize)),
  };
}

async function notifyPaymentAccessDecision(input: {
  applicationId: string; branchId: string; branchName: string; to: string; companyName: string; approved: boolean;
}) {
  try {
    const { sendPaymentAccessDecisionEmail } = await import("@/lib/email/payment-access");
    await sendPaymentAccessDecisionEmail(input);
  } catch {
    // A committed decision stays successful. Never log recipient, bank or provider error text.
    console.warn(JSON.stringify({ event: "payment_access_email_failed", applicationId: input.applicationId, approved: input.approved }));
  }
}
