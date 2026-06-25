import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction } from "@/generated/prisma/enums";
import {
  createVendorApplication,
  reviewVendorApplication,
} from "@/lib/vendors/applications";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/audit";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vendorProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    vendorApplication: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

const vendorProfile = vi.mocked(prisma.vendorProfile);
const vendorApplication = vi.mocked(prisma.vendorApplication);
const writeAuditLogMock = vi.mocked(writeAuditLog);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createVendorApplication", () => {
  it("throws when the user has no vendor profile", async () => {
    vendorProfile.findUnique.mockResolvedValueOnce(null);

    await expect(
    createVendorApplication({
      userId: "user_1",
      input: {
        companyName: "Acme Corp",
        companyRegistrationNumber: "12345",
        serviceCategory: "Health",
        description: "We verify credentials for healthcare professionals.",
        contactPersonName: "Jane Doe",
        contactEmail: "jane@example.com",
        justification: "We verify degrees",
        requestedScopes: [],
      },
    }),
  ).rejects.toThrow("No vendor profile found for this account.");
});

  it("throws when an application is already pending", async () => {
    vendorProfile.findUnique.mockResolvedValueOnce({ id: "profile_1" } as never);
    vendorApplication.findFirst.mockResolvedValueOnce({ id: "app_1" } as never);

    await expect(
    createVendorApplication({
      userId: "user_1",
      input: {
        companyName: "Acme Corp",
        companyRegistrationNumber: "12345",
        serviceCategory: "Health",
        description: "We verify credentials for healthcare professionals.",
        contactPersonName: "Jane Doe",
        contactEmail: "jane@example.com",
        justification: "We verify degrees",
        requestedScopes: [],
      },
    }),
  ).rejects.toThrow("You already have an application under review.");
});

  it("creates a pending application and writes an audit entry", async () => {
    vendorProfile.findUnique.mockResolvedValueOnce({ id: "profile_1" } as never);
    vendorApplication.findFirst.mockResolvedValueOnce(null);
    vendorProfile.update.mockResolvedValueOnce({} as never);
    vendorApplication.create.mockResolvedValueOnce({ id: "app_1" } as never);

    await createVendorApplication({
      userId: "user_1",
      input: {
        companyName: "Acme Corp",
        companyRegistrationNumber: "12345",
        serviceCategory: "Health",
        website: "https://example.com",
        description: "We verify credentials for healthcare professionals.",
        contactPersonName: "Jane Doe",
        contactEmail: "jane@example.com",
        justification: "We verify degrees",
        requestedScopes: ["degree"],
      },
    });

    expect(vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: {
        companyName: "Acme Corp",
        serviceCategory: "Health",
        contactEmail: "jane@example.com",
        website: "https://example.com",
        description: "We verify credentials for healthcare professionals.",
        contactPersonName: "Jane Doe",
      },
    });
    expect(vendorApplication.create).toHaveBeenCalledWith({
      data: {
        vendorProfileId: "profile_1",
        justification: "We verify degrees",
        requestedScopes: ["degree"],
        companyRegistrationNumber: "12345",
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_SUBMITTED,
        targetId: "app_1",
      }),
    );
  });
});

describe("reviewVendorApplication", () => {
  it("throws when the application is not pending", async () => {
    vendorApplication.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      reviewVendorApplication({
        applicationId: "app_1",
        decision: "APPROVED",
        reviewerId: "admin_1",
      }),
    ).rejects.toThrow("This application is not pending review.");
  });

  it("approves a pending application and writes an audit entry", async () => {
    vendorApplication.updateMany.mockResolvedValueOnce({ count: 1 });
    vendorApplication.findUniqueOrThrow.mockResolvedValueOnce({
      id: "app_1",
      status: "APPROVED",
    } as never);

    await reviewVendorApplication({
      applicationId: "app_1",
      decision: "APPROVED",
      reviewerId: "admin_1",
    });

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_APPROVED,
        actorId: "admin_1",
        targetId: "app_1",
      }),
    );
  });

  it("rejects a pending application and writes an audit entry", async () => {
    vendorApplication.updateMany.mockResolvedValueOnce({ count: 1 });
    vendorApplication.findUniqueOrThrow.mockResolvedValueOnce({
      id: "app_1",
      status: "REJECTED",
    } as never);

    await reviewVendorApplication({
      applicationId: "app_1",
      decision: "REJECTED",
      reviewerId: "admin_1",
      notes: "Insufficient documentation",
    });

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_APPLICATION_REJECTED,
        meta: { notes: "Insufficient documentation" },
      }),
    );
  });
});
