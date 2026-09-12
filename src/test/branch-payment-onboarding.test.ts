import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuditAction,
  BranchPaymentAcceptanceStatus,
  BranchPaymentApplicationStatus,
  CampusStatus,
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
    vendorPaymentProfile: { upsert: vi.fn() },
    walletAccount: { upsert: vi.fn() },
    vendorBranchPaymentAcceptance: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
  };
});

const writeAuditLogMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: database.runTransaction,
  },
}));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import {
  approveBranchPaymentApplication,
  closeBranchPaymentAcceptance,
  submitBranchPaymentApplication,
} from "@/lib/payments/branchOnboarding";

const branch = {
  id: "branch-1",
  vendorProfileId: "vendor-1",
  active: true,
  status: VendorBranchStatus.ACTIVE,
  campusStatus: CampusStatus.ON_CAMPUS,
  paymentAcceptance: null,
  paymentApplications: [],
  vendorProfile: { id: "vendor-1" },
};

describe("branch payment onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.runTransaction.mockImplementation(async (operation) => operation(database.transaction));
    database.transaction.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: true }]);
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
    });

    expect(database.transaction.vendorBranchPaymentApplication.create).toHaveBeenCalledWith({
      data: {
        vendorBranchId: "branch-1",
        status: BranchPaymentApplicationStatus.PENDING,
        submittedAt: expect.any(Date),
      },
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

  it("blocks approval until the branch is marked on-campus", async () => {
    database.transaction.vendorBranchPaymentApplication.findUnique.mockResolvedValueOnce({
      id: "payment-app-1",
      status: BranchPaymentApplicationStatus.PENDING,
      vendorBranch: { ...branch, campusStatus: CampusStatus.OFF_CAMPUS },
    });

    await expect(approveBranchPaymentApplication({
      applicationId: "payment-app-1",
      reviewerId: "admin-1",
    })).rejects.toThrow("marked as on-campus");

    expect(database.transaction.vendorPaymentProfile.upsert).not.toHaveBeenCalled();
    expect(database.transaction.vendorBranchPaymentAcceptance.create).not.toHaveBeenCalled();
  });

  it("approves a pending request and provisions vendor payment readiness", async () => {
    database.transaction.vendorBranchPaymentApplication.findUnique.mockResolvedValueOnce({
      id: "payment-app-1",
      status: BranchPaymentApplicationStatus.PENDING,
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

    await closeBranchPaymentAcceptance({
      branchId: "branch-1",
      actorId: "admin-2",
      notes: "No longer on campus",
    });

    expect(database.transaction.vendorBranchPaymentAcceptance.update).toHaveBeenCalledWith({
      where: { vendorBranchId: "branch-1" },
      data: {
        status: BranchPaymentAcceptanceStatus.CLOSED,
        suspendedAt: expect.any(Date),
        suspensionReason: "No longer on campus",
      },
    });
    expect(database.transaction.vendorBranchPaymentApplication.update).toHaveBeenCalledWith({
      where: { id: "payment-app-1" },
      data: expect.objectContaining({
        status: BranchPaymentApplicationStatus.REVOKED,
      }),
    });
  });
});
