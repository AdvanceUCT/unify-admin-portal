import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuditAction,
  BranchPaymentAcceptanceStatus,
  BranchPaymentApplicationStatus,
  VendorBranchStatus,
  VendorPaymentProfileStatus,
  WalletAccountType,
} from "@/generated/prisma/enums";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => {
  const transaction = {
    universityProfile: { findMany: vi.fn() },
    vendorBranch: { findFirst: vi.fn(), update: vi.fn() },
    vendorBranchPaymentApplication: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    vendorPaymentProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    walletAccount: { upsert: vi.fn() },
    vendorBranchPaymentAcceptance: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    vendorBranch: { findMany: vi.fn() },
    transaction,
    runTransaction: vi.fn(),
  };
});

const writeAuditLogMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: database.runTransaction,
    vendorBranch: database.vendorBranch,
  },
}));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/vendors/integrationCrypto", () => ({
  decryptVendorSecret: vi.fn(() => JSON.stringify({
    provider: "PAYSTACK",
    recipientCode: "RCP_demo_recipient",
    accountHolderName: "Campus Cafe",
    accountMask: "**** 1234",
    bankCode: "250655",
    bankName: "Demo Bank",
  })),
}));

import {
  PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
  approveBranchPaymentApplication,
  listPaymentHistoryBranchIdsForContext,
  revokeBranchPaymentAcceptance,
  submitBranchPaymentApplication,
} from "@/lib/payments/branchOnboarding";

const branch = {
  id: "branch-1",
  vendorProfileId: "vendor-1",
  active: true,
  status: VendorBranchStatus.ACTIVE,
  paymentAcceptance: null,
  paymentApplications: [],
  vendorProfile: { id: "vendor-1" },
};

describe("branch payment onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.runTransaction.mockImplementation(async (operation) => operation(database.transaction));
    database.transaction.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: true }]);
    database.transaction.vendorPaymentProfile.findUnique.mockResolvedValue({
      payoutDestinationCiphertext: "encrypted-safe-payout",
      payoutDestinationReference: "RCP_demo_recipient",
      payoutProvider: "PAYSTACK",
    });
  });

  it("submits a pending branch payment-access request for an active vendor branch", async () => {
    database.transaction.vendorBranch.findFirst.mockResolvedValueOnce(branch);
    database.transaction.vendorBranchPaymentApplication.create.mockResolvedValueOnce({
      id: "payment-app-1",
      vendorBranchId: "branch-1",
      status: BranchPaymentApplicationStatus.PENDING,
    });

    await submitBranchPaymentApplication({
      vendorProfileId: "vendor-1",
      branchId: "branch-1",
      actorId: "vendor-user-1",
      acknowledgementAccepted: true,
    });

    expect(database.transaction.vendorBranchPaymentApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorBranchId: "branch-1",
        status: BranchPaymentApplicationStatus.PENDING,
        payoutProviderSnapshot: "PAYSTACK",
        payoutDestinationReferenceSnapshot: "RCP_demo_recipient",
        payoutDestinationSnapshot: expect.objectContaining({ accountMask: "**** 1234" }),
        studentDataAcknowledgementText: PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
        submittedAt: expect.any(Date),
      }),
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_BRANCH_PAYMENT_APPLICATION_SUBMITTED,
        actorId: "vendor-user-1",
        targetId: "payment-app-1",
      }),
      database.transaction,
    );
  });

  it("blocks approval until the request contains payout and acknowledgement details", async () => {
    database.transaction.vendorBranchPaymentApplication.findUnique.mockResolvedValueOnce({
      id: "payment-app-1",
      status: BranchPaymentApplicationStatus.PENDING,
      payoutDestinationReferenceSnapshot: null,
      payoutDestinationSnapshot: null,
      studentDataAcknowledgedAt: null,
      studentDataAcknowledgementText: null,
      vendorBranch: branch,
    });

    await expect(approveBranchPaymentApplication({
      applicationId: "payment-app-1",
      reviewerId: "admin-1",
    })).rejects.toThrow("missing its payout destination");

    expect(database.transaction.vendorPaymentProfile.upsert).not.toHaveBeenCalled();
    expect(database.transaction.vendorBranchPaymentAcceptance.create).not.toHaveBeenCalled();
  });

  it("approves a pending request and provisions vendor payment readiness", async () => {
    database.transaction.vendorBranchPaymentApplication.findUnique.mockResolvedValueOnce({
      id: "payment-app-1",
      status: BranchPaymentApplicationStatus.PENDING,
      payoutDestinationReferenceSnapshot: "RCP_demo_recipient",
      payoutDestinationSnapshot: { accountMask: "**** 1234" },
      studentDataAcknowledgedAt: new Date("2026-09-12T07:00:00.000Z"),
      studentDataAcknowledgementText: PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
      vendorBranch: branch,
    });
    database.transaction.vendorBranchPaymentApplication.updateMany.mockResolvedValueOnce({ count: 1 });
    database.transaction.vendorBranchPaymentAcceptance.create.mockResolvedValueOnce({
      id: "acceptance-1",
      vendorBranchId: "branch-1",
      qrIdentifier: "pay_branch-1",
      status: BranchPaymentAcceptanceStatus.ACTIVE,
    });

    await approveBranchPaymentApplication({
      applicationId: "payment-app-1",
      reviewerId: "admin-1",
      notes: "Looks good",
    });

    expect(database.transaction.vendorPaymentProfile.upsert).toHaveBeenCalledWith({
      where: { vendorProfileId: "vendor-1" },
      create: expect.objectContaining({
        vendorProfileId: "vendor-1",
        status: VendorPaymentProfileStatus.APPROVED,
        approvedByUserId: "admin-1",
      }),
      update: expect.objectContaining({
        status: VendorPaymentProfileStatus.APPROVED,
        approvedByUserId: "admin-1",
      }),
    });
    expect(database.transaction.walletAccount.upsert).toHaveBeenCalledWith({
      where: { vendorProfileId: "vendor-1" },
      create: {
        type: WalletAccountType.VENDOR,
        currency: "ZAR",
        vendorProfileId: "vendor-1",
      },
      update: {},
    });
    expect(database.transaction.vendorBranchPaymentAcceptance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorBranchId: "branch-1",
        approvedApplicationId: "payment-app-1",
        status: BranchPaymentAcceptanceStatus.ACTIVE,
        qrIdentifier: "pay_branch-1",
      }),
    });
  });

  it("closes an active acceptance and revokes the approved branch application", async () => {
    database.transaction.vendorBranchPaymentAcceptance.findUnique.mockResolvedValueOnce({
      id: "acceptance-1",
      vendorBranchId: "branch-1",
      approvedApplicationId: "payment-app-1",
      status: BranchPaymentAcceptanceStatus.ACTIVE,
      approvedApplication: {
        reviewedAt: new Date("2026-09-12T08:00:00.000Z"),
        reviewedByUserId: "admin-1",
        reviewNotes: "Approved",
      },
    });

    await revokeBranchPaymentAcceptance({
      branchId: "branch-1",
      actorId: "admin-2",
      notes: "Payment controls failed review",
    });

    expect(database.transaction.vendorBranchPaymentAcceptance.update).toHaveBeenCalledWith({
      where: { vendorBranchId: "branch-1" },
      data: {
        status: BranchPaymentAcceptanceStatus.CLOSED,
        suspendedAt: expect.any(Date),
        suspensionReason: "Payment controls failed review",
      },
    });
    expect(database.transaction.vendorBranchPaymentApplication.update).toHaveBeenCalledWith({
      where: { id: "payment-app-1" },
      data: expect.objectContaining({
        status: BranchPaymentApplicationStatus.REVOKED,
        revokedByUserId: "admin-2",
        revokedNotes: "Payment controls failed review",
      }),
    });
  });

  it("keeps revoked payment branches in the vendor payment-history scope", async () => {
    database.vendorBranch.findMany.mockResolvedValueOnce([
      { id: "branch-active" },
      { id: "branch-revoked" },
    ]);

    await expect(listPaymentHistoryBranchIdsForContext({
      userId: "vendor-user-1",
      vendorProfileId: "vendor-1",
      companyName: "Campus Cafe",
      role: "OWNER",
      branchIds: ["branch-active", "branch-revoked"],
    })).resolves.toEqual(["branch-active", "branch-revoked"]);

    expect(database.vendorBranch.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["branch-active", "branch-revoked"] },
        vendorProfileId: "vendor-1",
      },
      select: { id: true },
    });
  });
});
