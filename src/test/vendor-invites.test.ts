import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { hashInviteToken } from "@/lib/auth/invite-tokens";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import {
  acceptVendorInvite,
  createVendorInvite,
  getPendingVendorInviteByToken,
} from "@/lib/vendors/invites";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/config/env", () => ({
  env: {
    ADMIN_INVITE_TTL_HOURS: 24,
    APP_URL: "http://localhost:3000",
  },
}));

const database = vi.hoisted(() => {
  const transaction = {
    vendorInvite: {
      update: vi.fn(),
    },
    vendorProfile: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vendorInvite: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    vendorProfile: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: database.runTransaction,
  },
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      createUser: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/email/vendor-invites", () => ({
  sendVendorInviteEmail: vi.fn(),
}));

vi.mock("@/lib/vendors/applications", () => ({
  ensureVendorVerificationServicePoint: vi.fn(),
}));

const vendorInvite = vi.mocked(prisma.vendorInvite);
const vendorProfile = vi.mocked(prisma.vendorProfile);
const user = vi.mocked(prisma.user);
const auditLog = vi.mocked(prisma.auditLog);
const createUser = vi.mocked(auth.api.createUser);
const writeAuditLogMock = vi.mocked(writeAuditLog);

function invite(overrides = {}) {
  return {
    id: "invite_1",
    email: "branch@example.com",
    name: "Branch Manager",
    locationName: "Cape Town Branch",
    locationAddress: "1 Long Street",
    tokenHash: hashInviteToken("valid-token"),
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
    revokedByUserId: null,
    parentVendorProfileId: "parent_profile_1",
    createdByUserId: "parent_user_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    parentVendorProfile: {
      id: "parent_profile_1",
      companyName: "Acme Vendors",
      serviceCategory: "Retail",
      website: "https://example.com",
    },
    ...overrides,
  };
}

describe("vendor invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLog.findFirst.mockResolvedValue(null);
    database.runTransaction.mockImplementation(async (operation) =>
      operation(database.transaction),
    );
    database.transaction.vendorProfile.create.mockResolvedValue({ id: "location_profile_1" });
  });

  it("returns a pending vendor invite for a valid token", async () => {
    const pendingInvite = invite();
    vendorInvite.findUnique.mockResolvedValueOnce(pendingInvite as never);

    await expect(getPendingVendorInviteByToken("valid-token")).resolves.toEqual(pendingInvite);
  });

  it("creates a parent-scoped vendor invite and supersedes older pending invites", async () => {
    vendorProfile.findFirst.mockResolvedValueOnce({
      id: "parent_profile_1",
      companyName: "Acme Vendors",
      serviceCategory: "Retail",
    } as never);
    user.findUnique.mockResolvedValueOnce(null);
    vendorInvite.updateMany.mockResolvedValueOnce({ count: 1 });
    vendorInvite.create.mockResolvedValueOnce(invite() as never);

    await createVendorInvite({
      input: {
        email: "BRANCH@example.com",
        name: "Branch Manager",
        locationName: "Cape Town Branch",
        locationAddress: "1 Long Street",
      },
      createdByUserId: "parent_user_1",
      parentVendorProfileId: "parent_profile_1",
    });

    expect(vendorInvite.updateMany).toHaveBeenCalledWith({
      where: {
        parentVendorProfileId: "parent_profile_1",
        email: "branch@example.com",
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: {
        revokedAt: expect.any(Date),
        revokedByUserId: "parent_user_1",
      },
    });
    expect(vendorInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "branch@example.com",
        parentVendorProfileId: "parent_profile_1",
        locationName: "Cape Town Branch",
      }),
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VENDOR_INVITE_CREATED,
        targetType: "vendor_invite",
      }),
    );
  });

  it("atomically claims the invite before creating the sub-vendor account", async () => {
    vendorInvite.findUnique.mockResolvedValueOnce(invite() as never);
    vendorInvite.updateMany.mockResolvedValueOnce({ count: 1 });
    createUser.mockResolvedValueOnce({
      user: {
        id: "sub_vendor_user_1",
      },
    } as never);

    await acceptVendorInvite({
      token: "valid-token",
      password: "long-enough-password",
      confirmPassword: "long-enough-password",
    });

    expect(vendorInvite.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite_1",
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: {
        acceptedAt: expect.any(Date),
      },
    });
    expect(createUser).toHaveBeenCalledWith({
      body: {
        email: "branch@example.com",
        name: "Branch Manager",
        password: "long-enough-password",
        data: {
          emailVerified: true,
          userType: "VENDOR",
        },
      },
    });
    expect(database.transaction.vendorProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "sub_vendor_user_1",
        parentVendorProfileId: "parent_profile_1",
        companyName: "Acme Vendors",
        locationName: "Cape Town Branch",
      }),
      select: { id: true },
    });
  });

  it("rejects reuse when the invite cannot be claimed", async () => {
    vendorInvite.findUnique.mockResolvedValueOnce(invite() as never);
    vendorInvite.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      acceptVendorInvite({
        token: "valid-token",
        password: "long-enough-password",
        confirmPassword: "long-enough-password",
      }),
    ).rejects.toThrow("This invite link is invalid or has expired.");
    expect(createUser).not.toHaveBeenCalled();
  });
});
