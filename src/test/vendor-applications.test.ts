import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction, VendorApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  createVendorApplication,
  listDecidedVendorApplications,
  reviewVendorApplication,
  revokeVendorApplication,
} from "@/lib/vendors/applications";

const database = vi.hoisted(() => {
  const transaction = {
    vendorProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    vendorApplication: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...database.transaction,
    $transaction: database.runTransaction,
  },
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

const writeAuditLogMock = vi.mocked(writeAuditLog);

const validInput = {
  companyName: "Acme Corp",
  companyRegistrationNumber: "12345",
  serviceCategory: "Healthcare",
  website: "https://example.com",
  description: "We verify credentials for healthcare services.",
  contactPersonName: "Jane Doe",
  contactEmail: "jane@example.com",
  justification: "We need to confirm student eligibility.",
  requestedScopes: ["faculty", "year"],
};

const vendorProfile = {
  id: "profile_1",
  userId: "user_1",
  companyName: "Existing Company",
  serviceCategory: "Retail",
  contactEmail: "old@example.com",
  contactPersonName: "Old Contact",
  website: null,
  description: "Existing profile",
};

beforeEach(() => {
  vi.clearAllMocks();
  database.runTransaction.mockImplementation(async (operation) =>
    operation(database.transaction),
  );
});

describe("createVendorApplication", () => {
  it("throws when the user has no vendor profile", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce(null);

    await expect(
      createVendorApplication({ userId: "user_1", input: validInput }),
    ).rejects.toThrow("No vendor profile found for this account.");
  });

  it.each([
    [VendorApplicationStatus.PENDING, "under review"],
    [VendorApplicationStatus.APPROVED, "already approved"],
  ])("rejects a new application when one is %s", async (status, message) => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce(vendorProfile);
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce({ status });

    await expect(
      createVendorApplication({ userId: "user_1", input: validInput }),
    ).rejects.toThrow(message);
  });

  it.each([
    { requestedScopes: [] },
    { requestedScopes: ["degree"] },
    { requestedScopes: ["student_id"] },
  ])(
    "rejects unsupported scope selections: %j",
    async ({ requestedScopes }) => {
      await expect(
        createVendorApplication({
          userId: "user_1",
          input: { ...validInput, requestedScopes },
        }),
      ).rejects.toThrow();

      expect(database.runTransaction).not.toHaveBeenCalled();
    },
  );

  it("stores a deduplicated snapshot without changing the live profile", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce(vendorProfile);
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce(null);
    database.transaction.vendorApplication.create.mockResolvedValueOnce({ id: "app_1" });

    await createVendorApplication({
      userId: "user_1",
      input: {
        ...validInput,
        requestedScopes: ["faculty", "year", "faculty"],
      },
    });

    expect(database.transaction.vendorProfile.update).not.toHaveBeenCalled();
    expect(database.transaction.vendorApplication.create).toHaveBeenCalledWith({
      data: {
        vendorProfileId: "profile_1",
        justification: validInput.justification,
        requestedScopes: ["faculty", "year"],
        companyRegistrationNumber: "12345",
        snapshotCompanyName: "Acme Corp",
        snapshotServiceCategory: "Healthcare",
        snapshotContactEmail: "jane@example.com",
        snapshotContactPersonName: "Jane Doe",
        snapshotWebsite: "https://example.com",
        snapshotDescription: validInput.description,
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_SUBMITTED,
        targetId: "app_1",
      }),
      database.transaction,
    );
  });

  it("returns a useful error when the active-application constraint wins a race", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce(vendorProfile);
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce(null);
    database.transaction.vendorApplication.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(
      createVendorApplication({ userId: "user_1", input: validInput }),
    ).rejects.toThrow("already have an application under review");
  });
});

describe("reviewVendorApplication", () => {
  const pendingApplication = {
    id: "app_1",
    vendorProfileId: "profile_1",
    status: VendorApplicationStatus.PENDING,
    snapshotCompanyName: "Acme Corp",
    snapshotServiceCategory: "Healthcare",
    snapshotContactEmail: "jane@example.com",
    snapshotContactPersonName: "Jane Doe",
    snapshotWebsite: "https://example.com",
    snapshotDescription: validInput.description,
    vendorProfile,
  };

  it("throws when the application is not pending", async () => {
    database.transaction.vendorApplication.findUnique.mockResolvedValueOnce({
      ...pendingApplication,
      status: VendorApplicationStatus.REJECTED,
    });

    await expect(
      reviewVendorApplication({
        applicationId: "app_1",
        decision: "APPROVED",
        reviewerId: "admin_1",
      }),
    ).rejects.toThrow("This application is not pending review.");
  });

  it("applies the submitted snapshot to the live profile on approval", async () => {
    database.transaction.vendorApplication.findUnique.mockResolvedValueOnce(pendingApplication);
    database.transaction.vendorApplication.updateMany.mockResolvedValueOnce({ count: 1 });
    database.transaction.vendorApplication.findUniqueOrThrow.mockResolvedValueOnce({
      id: "app_1",
      status: VendorApplicationStatus.APPROVED,
    });

    await reviewVendorApplication({
      applicationId: "app_1",
      decision: "APPROVED",
      reviewerId: "admin_1",
    });

    expect(database.transaction.vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: {
        companyName: "Acme Corp",
        serviceCategory: "Healthcare",
        contactEmail: "jane@example.com",
        contactPersonName: "Jane Doe",
        website: "https://example.com",
        description: validInput.description,
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_APPROVED,
        actorId: "admin_1",
      }),
      database.transaction,
    );
  });

  it("does not change the live profile when rejecting an application", async () => {
    database.transaction.vendorApplication.findUnique.mockResolvedValueOnce(pendingApplication);
    database.transaction.vendorApplication.updateMany.mockResolvedValueOnce({ count: 1 });
    database.transaction.vendorApplication.findUniqueOrThrow.mockResolvedValueOnce({
      id: "app_1",
      status: VendorApplicationStatus.REJECTED,
    });

    await reviewVendorApplication({
      applicationId: "app_1",
      decision: "REJECTED",
      reviewerId: "admin_1",
      notes: "Insufficient documentation",
    });

    expect(database.transaction.vendorProfile.update).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_REJECTED,
        meta: { notes: "Insufficient documentation" },
      }),
      database.transaction,
    );
  });
});

describe("revokeVendorApplication", () => {
  it("requires a reason", async () => {
    await expect(
      revokeVendorApplication({
        applicationId: "app_1",
        reviewerId: "admin_1",
        notes: "   ",
      }),
    ).rejects.toThrow("A revocation reason is required");
  });

  it("records revocation metadata without overwriting the approval decision", async () => {
    database.transaction.vendorApplication.updateMany.mockResolvedValueOnce({ count: 1 });

    await revokeVendorApplication({
      applicationId: "app_1",
      reviewerId: "admin_2",
      notes: "Contract ended",
    });

    expect(database.transaction.vendorApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "app_1", status: VendorApplicationStatus.APPROVED },
      data: {
        status: VendorApplicationStatus.REVOKED,
        revokedByUserId: "admin_2",
        revokedAt: expect.any(Date),
        revokedNotes: "Contract ended",
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_REVOKED,
        meta: { notes: "Contract ended" },
      }),
      database.transaction,
    );
  });
});

describe("listDecidedVendorApplications", () => {
  it("uses revocation details for revoked rows and sorts by the effective decision date", async () => {
    const approvedAt = new Date("2026-06-01T10:00:00.000Z");
    const revokedAt = new Date("2026-06-20T10:00:00.000Z");
    database.transaction.vendorApplication.findMany.mockResolvedValueOnce([
      {
        id: "approved_app",
        status: VendorApplicationStatus.APPROVED,
        reviewedByUserId: "admin_1",
        reviewedAt: approvedAt,
        reviewNotes: "Approved",
        revokedByUserId: null,
        revokedAt: null,
        revokedNotes: null,
        snapshotCompanyName: "Approved Vendor",
        snapshotServiceCategory: "Retail",
        vendorProfile: { companyName: "Live Approved", serviceCategory: "Retail" },
      },
      {
        id: "revoked_app",
        status: VendorApplicationStatus.REVOKED,
        reviewedByUserId: "admin_1",
        reviewedAt: approvedAt,
        reviewNotes: "Originally approved",
        revokedByUserId: "admin_2",
        revokedAt,
        revokedNotes: "Contract ended",
        snapshotCompanyName: "Revoked Vendor",
        snapshotServiceCategory: "Food",
        vendorProfile: { companyName: "Live Revoked", serviceCategory: "Food" },
      },
    ]);
    database.transaction.user.findMany.mockResolvedValueOnce([
      { id: "admin_1", name: "First Admin" },
      { id: "admin_2", name: "Second Admin" },
    ]);

    const decisions = await listDecidedVendorApplications();

    expect(decisions.map((decision) => decision.id)).toEqual([
      "revoked_app",
      "approved_app",
    ]);
    expect(decisions[0]).toEqual(
      expect.objectContaining({
        decisionActorName: "Second Admin",
        decisionAt: revokedAt,
        decisionNotes: "Contract ended",
        companyName: "Revoked Vendor",
      }),
    );
  });
});
