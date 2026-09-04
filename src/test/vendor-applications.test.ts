import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction, VendorApplicationStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  assertDraftDocumentUploadAllowed,
  clearDraftDocumentPath,
  ensureVendorVerificationServicePoint,
  getOrCreateDraftApplication,
  listDecidedVendorApplications,
  reviewVendorApplication,
  revokeVendorApplication,
  saveDraftDocumentPath,
} from "@/lib/vendors/applications";

const agentClient = vi.hoisted(() => ({
  AgentServiceError: class AgentServiceError extends Error {
    constructor(
      message: string,
      public status: number,
      public details?: unknown,
    ) {
      super(message);
      this.name = "AgentServiceError";
    }
  },
  createVerificationServicePoint: vi.fn(),
  listVerificationServicePoints: vi.fn(),
  updateVerificationServicePoint: vi.fn(),
}));

const database = vi.hoisted(() => {
  const transaction = {
    vendorProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    vendorMembership: { upsert: vi.fn() },
    vendorBranch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    vendorApplication: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

vi.mock("@/lib/agentClient", () => ({
  AgentServiceError: agentClient.AgentServiceError,
  createVerificationServicePoint: agentClient.createVerificationServicePoint,
  listVerificationServicePoints: agentClient.listVerificationServicePoints,
  updateVerificationServicePoint: agentClient.updateVerificationServicePoint,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...database.transaction,
    $transaction: database.runTransaction,
  },
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
  },
}));

vi.mock("@/lib/email/vendor-application-submitted", () => ({
  sendVendorApplicationSubmittedEmail: vi.fn(),
}));

vi.mock("@/lib/email/vendor-application-approved", () => ({
  sendVendorApplicationApprovedEmail: vi.fn(),
}));

vi.mock("@/lib/email/vendor-application-rejected", () => ({
  sendVendorApplicationRejectedEmail: vi.fn(),
}));

vi.mock("@/lib/email/vendor-application-revoked", () => ({
  sendVendorApplicationRevokedEmail: vi.fn(),
}));

const writeAuditLogMock = vi.mocked(writeAuditLog);

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
  agentClient.createVerificationServicePoint.mockResolvedValue({
    id: "sp_1",
    verificationUrl: "https://verify.example.com/verify/sp-public-1",
  });
  agentClient.listVerificationServicePoints.mockResolvedValue([]);
});

describe("assertDraftDocumentUploadAllowed", () => {
  it("rejects unsupported document fields before storage upload", async () => {
    await expect(
      assertDraftDocumentUploadAllowed("app_1", "user_1", "docPassport"),
    ).rejects.toThrow("Invalid document field: docPassport");

    expect(database.transaction.vendorApplication.findFirst).not.toHaveBeenCalled();
  });

  it("rejects applications that do not belong to the signed-in vendor", async () => {
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertDraftDocumentUploadAllowed("app_2", "user_1", "docProofOfAddress"),
    ).rejects.toThrow("Draft application not found.");

    expect(database.transaction.vendorApplication.findFirst).toHaveBeenCalledWith({
      where: {
        id: "app_2",
        vendorProfile: { userId: "user_1" },
        status: VendorApplicationStatus.DRAFT,
      },
      select: { id: true },
    });
  });
});

describe("draft application document paths", () => {
  const carriedPath = "app/rejected_1/docProofOfAddress/proof.pdf";

  it("does not return a replaced path for deletion while another application references it", async () => {
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce({
      id: "draft_1",
      docProofOfAddress: carriedPath,
    });
    database.transaction.vendorApplication.update.mockResolvedValueOnce({ id: "draft_1" });
    database.transaction.vendorApplication.count.mockResolvedValueOnce(1);

    await expect(
      saveDraftDocumentPath(
        "draft_1",
        "user_1",
        "docProofOfAddress",
        "app/draft_1/docProofOfAddress/new.pdf",
      ),
    ).resolves.toEqual({ previousPath: null });
  });

  it("does not return a cleared path for deletion while another application references it", async () => {
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce({
      id: "draft_1",
      docProofOfAddress: carriedPath,
    });
    database.transaction.vendorApplication.update.mockResolvedValueOnce({ id: "draft_1" });
    database.transaction.vendorApplication.count.mockResolvedValueOnce(1);

    await expect(
      clearDraftDocumentPath("draft_1", "user_1", "docProofOfAddress"),
    ).resolves.toEqual({ removedPath: null });
  });

  it("returns an unshared path so its storage object can be deleted", async () => {
    database.transaction.vendorApplication.findFirst.mockResolvedValueOnce({
      id: "draft_1",
      docProofOfAddress: "app/draft_1/docProofOfAddress/old.pdf",
    });
    database.transaction.vendorApplication.update.mockResolvedValueOnce({ id: "draft_1" });
    database.transaction.vendorApplication.count.mockResolvedValueOnce(0);

    await expect(
      clearDraftDocumentPath("draft_1", "user_1", "docProofOfAddress"),
    ).resolves.toEqual({
      removedPath: "app/draft_1/docProofOfAddress/old.pdf",
    });
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
    vendorProfile,
  };

  it("requires a reason before rejecting an application", async () => {
    await expect(
      reviewVendorApplication({
        applicationId: "app_1",
        decision: "REJECTED",
        reviewerId: "admin_1",
        notes: "   ",
      }),
    ).rejects.toThrow("A rejection reason is required");

    expect(database.runTransaction).not.toHaveBeenCalled();
  });

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
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce({
      ...vendorProfile,
      companyName: "Acme Corp",
      verificationUrl: null,
      agentServicePointId: null,
      defaultBranchId: null,
      branches: [],
    });
    database.transaction.vendorBranch.create.mockResolvedValueOnce({
      id: "branch_1",
      vendorProfileId: "profile_1",
      agentServicePointId: null,
      verificationUrl: null,
    });
    database.transaction.vendorBranch.findUnique.mockResolvedValueOnce({
      id: "branch_1",
      vendorProfileId: "profile_1",
      name: "Main Branch",
      agentServicePointId: null,
      verificationUrl: null,
      vendorProfile: { companyName: "Acme Corp" },
    });
    database.transaction.vendorBranch.update.mockResolvedValueOnce({
      id: "branch_1",
      agentServicePointId: "sp_1",
      verificationUrl: "https://verify.example.com/verify/sp-public-1",
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
      },
    });
    expect(agentClient.createVerificationServicePoint).toHaveBeenCalledWith({
      vendorId: "profile_1",
      vendorName: "Acme Corp",
      externalId: "branch_1",
      name: "Main Branch",
    });
    expect(database.transaction.vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: {
        defaultBranchId: "branch_1",
        verificationUrl: "https://verify.example.com/verify/sp-public-1",
        agentServicePointId: "sp_1",
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
    expect(database.transaction.vendorApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "app_1", status: VendorApplicationStatus.PENDING },
      data: {
        status: VendorApplicationStatus.REJECTED,
        reviewedByUserId: "admin_1",
        reviewedAt: expect.any(Date),
        reviewNotes: "Insufficient documentation",
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_REJECTED,
        meta: { notes: "Insufficient documentation" },
      }),
      database.transaction,
    );
  });
});

describe("ensureVendorVerificationServicePoint", () => {
  it("returns the existing URL without recreating the service point", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce({
      ...vendorProfile,
      verificationUrl: "https://verify.example.com/verify/existing",
      agentServicePointId: "sp_existing",
      defaultBranchId: "branch_1",
      branches: [{
        id: "branch_1",
        agentServicePointId: "sp_existing",
        verificationUrl: "https://verify.example.com/verify/existing",
      }],
    });

    await expect(ensureVendorVerificationServicePoint("profile_1")).resolves.toBe(
      "https://verify.example.com/verify/existing",
    );
    expect(agentClient.createVerificationServicePoint).not.toHaveBeenCalled();
  });

  it("recovers the URL when the agent reports a duplicate service point", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce({
      ...vendorProfile,
      verificationUrl: null,
      agentServicePointId: null,
      defaultBranchId: null,
      branches: [],
    });
    database.transaction.vendorBranch.create.mockResolvedValueOnce({
      id: "branch_1",
      vendorProfileId: "profile_1",
      agentServicePointId: null,
      verificationUrl: null,
    });
    database.transaction.vendorBranch.findUnique.mockResolvedValueOnce({
      id: "branch_1",
      vendorProfileId: "profile_1",
      name: "Main Branch",
      agentServicePointId: null,
      verificationUrl: null,
      vendorProfile: { companyName: "Existing Company" },
    });
    agentClient.createVerificationServicePoint.mockRejectedValueOnce(
      new agentClient.AgentServiceError("Duplicate service point", 409),
    );
    agentClient.listVerificationServicePoints.mockResolvedValueOnce([
      {
        id: "sp_1",
        vendorId: "profile_1",
        vendorName: "Existing Company",
        externalId: "branch_1",
        name: "Main Branch",
        active: true,
        verificationUrl: "https://verify.example.com/verify/recovered",
      },
    ]);
    database.transaction.vendorBranch.update.mockResolvedValueOnce({
      id: "branch_1",
      agentServicePointId: "sp_1",
      verificationUrl: "https://verify.example.com/verify/recovered",
    });

    await expect(ensureVendorVerificationServicePoint("profile_1")).resolves.toBe(
      "https://verify.example.com/verify/recovered",
    );
    expect(database.transaction.vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: {
        defaultBranchId: "branch_1",
        verificationUrl: "https://verify.example.com/verify/recovered",
        agentServicePointId: "sp_1",
      },
    });
  });

  it("does not save a verification URL when service-point creation times out", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce({
      ...vendorProfile,
      verificationUrl: null,
      agentServicePointId: null,
      defaultBranchId: null,
      branches: [],
    });
    database.transaction.vendorBranch.create.mockResolvedValueOnce({
      id: "branch_1",
      vendorProfileId: "profile_1",
      agentServicePointId: null,
      verificationUrl: null,
    });
    database.transaction.vendorBranch.findUnique.mockResolvedValueOnce({
      id: "branch_1",
      vendorProfileId: "profile_1",
      name: "Main Branch",
      agentServicePointId: null,
      verificationUrl: null,
      vendorProfile: { companyName: "Existing Company" },
    });
    agentClient.createVerificationServicePoint.mockRejectedValueOnce(
      new agentClient.AgentServiceError("Agent service request timed out after 15000ms.", 504, {
        code: "AGENT_SERVICE_TIMEOUT",
      }),
    );

    await expect(ensureVendorVerificationServicePoint("profile_1")).rejects.toMatchObject({
      message: "Agent service request timed out after 15000ms.",
      status: 504,
    });
    expect(agentClient.listVerificationServicePoints).not.toHaveBeenCalled();
    expect(database.transaction.vendorProfile.update).not.toHaveBeenCalled();
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
    database.transaction.vendorApplication.findUnique.mockResolvedValueOnce({
      id: "app_1",
      status: VendorApplicationStatus.APPROVED,
      snapshotCompanyName: "Acme Corp",
      snapshotContactEmail: "jane@example.com",
      snapshotContactPersonName: "Jane Doe",
      vendorProfile,
    });
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

describe("getOrCreateDraftApplication", () => {
  it("creates a blank draft when there is no prior decision to carry forward", async () => {
    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce(vendorProfile);
    database.transaction.vendorApplication.findFirst
      .mockResolvedValueOnce(null) // existingActive
      .mockResolvedValueOnce(null) // existingDraft
      .mockResolvedValueOnce(null); // previousDecision
    database.transaction.vendorApplication.create.mockResolvedValueOnce({ id: "draft_1" });

    await getOrCreateDraftApplication("user_1");

    expect(database.transaction.vendorApplication.create).toHaveBeenCalledWith({
      data: { vendorProfileId: "profile_1", status: VendorApplicationStatus.DRAFT },
    });
  });

  it("carries forward details from the most recent rejection, but not the declaration", async () => {
    const rejectedApplication = {
      id: "rejected_1",
      justification: "Need to verify students",
      companyRegistrationNumber: "12345",
      snapshotCompanyName: "Acme Corp",
      snapshotServiceCategory: "Healthcare",
      snapshotContactEmail: "jane@example.com",
      snapshotContactPersonName: "Jane Doe",
      snapshotWebsite: "https://example.com",
      tradingName: "Acme",
      organisationType: "Private company",
      physicalAddress: "1 Main Street",
      postalAddress: null,
      yearOfIncorporation: 2010,
      city: "Cape Town",
      country: "South Africa",
      operatesInMultipleCountries: false,
      operatingCountries: [],
      contactJobTitle: "Ops Manager",
      contactPhone: "0821234567",
      contactEmployeeNumber: null,
      preferredContactMethod: "email",
      additionalInfo: null,
      docRegistrationCertificate: "app/rejected_1/docRegistrationCertificate/cert.pdf",
      docProofOfAddress: "app/rejected_1/docProofOfAddress/proof.pdf",
      docRepresentativeId: "app/rejected_1/docRepresentativeId/id.pdf",
      docLetterOfAuthorisation: "app/rejected_1/docLetterOfAuthorisation/letter.pdf",
      docTaxCompliance: null,
      docBusinessLicence: null,
      declarationAccepted: true,
      declarationAcceptedAt: new Date("2026-05-01T00:00:00.000Z"),
    };

    database.transaction.vendorProfile.findUnique.mockResolvedValueOnce(vendorProfile);
    database.transaction.vendorApplication.findFirst
      .mockResolvedValueOnce(null) // existingActive
      .mockResolvedValueOnce(null) // existingDraft
      .mockResolvedValueOnce(rejectedApplication); // previousDecision
    database.transaction.vendorApplication.create.mockResolvedValueOnce({ id: "draft_2" });

    await getOrCreateDraftApplication("user_1");

    expect(database.transaction.vendorApplication.create).toHaveBeenCalledWith({
      data: {
        vendorProfileId: "profile_1",
        status: VendorApplicationStatus.DRAFT,
        justification: rejectedApplication.justification,
        companyRegistrationNumber: rejectedApplication.companyRegistrationNumber,
        snapshotCompanyName: rejectedApplication.snapshotCompanyName,
        snapshotServiceCategory: rejectedApplication.snapshotServiceCategory,
        snapshotContactEmail: rejectedApplication.snapshotContactEmail,
        snapshotContactPersonName: rejectedApplication.snapshotContactPersonName,
        snapshotWebsite: rejectedApplication.snapshotWebsite,
        tradingName: rejectedApplication.tradingName,
        organisationType: rejectedApplication.organisationType,
        physicalAddress: rejectedApplication.physicalAddress,
        postalAddress: rejectedApplication.postalAddress,
        yearOfIncorporation: rejectedApplication.yearOfIncorporation,
        city: rejectedApplication.city,
        country: rejectedApplication.country,
        operatesInMultipleCountries: rejectedApplication.operatesInMultipleCountries,
        operatingCountries: rejectedApplication.operatingCountries,
        contactJobTitle: rejectedApplication.contactJobTitle,
        contactPhone: rejectedApplication.contactPhone,
        contactEmployeeNumber: rejectedApplication.contactEmployeeNumber,
        preferredContactMethod: rejectedApplication.preferredContactMethod,
        additionalInfo: rejectedApplication.additionalInfo,
        docRegistrationCertificate: rejectedApplication.docRegistrationCertificate,
        docProofOfAddress: rejectedApplication.docProofOfAddress,
        docRepresentativeId: rejectedApplication.docRepresentativeId,
        docLetterOfAuthorisation: rejectedApplication.docLetterOfAuthorisation,
        docTaxCompliance: rejectedApplication.docTaxCompliance,
        docBusinessLicence: rejectedApplication.docBusinessLicence,
      },
    });

    const createCallData = database.transaction.vendorApplication.create.mock.calls[0][0].data;
    expect(createCallData).not.toHaveProperty("declarationAccepted");
    expect(createCallData).not.toHaveProperty("declarationAcceptedAt");
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
