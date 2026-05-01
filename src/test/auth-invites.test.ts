import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction } from "@/generated/prisma/enums";
import {
  acceptAdminInvite,
  getPendingInviteByToken,
  hashInviteToken,
} from "@/lib/auth/invites";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/audit";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/config/env", () => ({
  env: {
    ADMIN_INVITE_TTL_HOURS: 24,
    APP_URL: "http://localhost:3000",
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    adminInvite: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
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

vi.mock("@/lib/email/admin-invites", () => ({
  sendAdminInviteEmail: vi.fn(),
}));

const adminInvite = vi.mocked(prisma.adminInvite);
const auditLog = vi.mocked(prisma.auditLog);
const writeAuditLogMock = vi.mocked(writeAuditLog);

function invite(overrides: Partial<Awaited<ReturnType<typeof getPendingInviteByToken>>> = {}) {
  return {
    id: "invite_1",
    email: "admin@example.com",
    name: "Admin User",
    role: "ADMIN",
    tokenHash: hashInviteToken("valid-token"),
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
    revokedByUserId: null,
    createdByUserId: "super_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("admin invite tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLog.findFirst.mockResolvedValue(null);
  });

  it("returns a pending invite for a valid token", async () => {
    const pendingInvite = invite();
    adminInvite.findUnique.mockResolvedValueOnce(pendingInvite);

    await expect(getPendingInviteByToken("valid-token")).resolves.toEqual(pendingInvite);
  });

  it("rejects mismatched token hashes", async () => {
    adminInvite.findUnique.mockResolvedValueOnce(invite({ tokenHash: hashInviteToken("other-token") }));

    await expect(getPendingInviteByToken("valid-token")).resolves.toBeNull();
  });

  it("rejects revoked and accepted invites", async () => {
    adminInvite.findUnique.mockResolvedValueOnce(invite({ revokedAt: new Date() }));
    await expect(getPendingInviteByToken("valid-token")).resolves.toBeNull();

    adminInvite.findUnique.mockResolvedValueOnce(invite({ acceptedAt: new Date() }));
    await expect(getPendingInviteByToken("valid-token")).resolves.toBeNull();
  });

  it("audits expired invites once when encountered", async () => {
    const expiredInvite = invite({ expiresAt: new Date(Date.now() - 60_000) });
    adminInvite.findUnique.mockResolvedValue(expiredInvite);

    await expect(getPendingInviteByToken("valid-token")).resolves.toBeNull();

    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.INVITE_EXPIRED,
        targetId: expiredInvite.id,
      }),
    );

    writeAuditLogMock.mockClear();
    auditLog.findFirst.mockResolvedValueOnce({
      id: "audit_1",
      actorId: null,
      action: AuditAction.INVITE_EXPIRED,
      targetType: "admin_invite",
      targetId: expiredInvite.id,
      meta: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });

    await expect(getPendingInviteByToken("valid-token")).resolves.toBeNull();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("prevents invite reuse when the invite cannot be atomically claimed", async () => {
    adminInvite.findUnique.mockResolvedValueOnce(invite());
    adminInvite.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      acceptAdminInvite({
        token: "valid-token",
        password: "long-enough-password",
        confirmPassword: "long-enough-password",
      }),
    ).rejects.toThrow("This invite link is invalid or has expired.");
  });
});
