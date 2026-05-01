import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deactivateUserAction,
  revokeInviteAction,
} from "@/app/(admin)/users/actions";
import { auth } from "@/lib/auth/auth";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      banUser: vi.fn(),
      revokeUserSessions: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/invites", () => ({
  createAdminInvite: vi.fn(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    adminInvite: {
      update: vi.fn(),
    },
  },
}));

const requireRoleMock = vi.mocked(requireRole);
const authApi = vi.mocked(auth.api);
const adminInvite = vi.mocked(prisma.adminInvite);
const revalidatePathMock = vi.mocked(revalidatePath);

describe("user management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      user: {
        id: "super_1",
        role: "SUPER_ADMIN",
      },
    } as Awaited<ReturnType<typeof requireRole>>);
  });

  it("deactivation bans a user and revokes all sessions", async () => {
    const formData = new FormData();
    formData.set("userId", "user_1");

    await deactivateUserAction(formData);

    expect(authApi.banUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          userId: "user_1",
        }),
      }),
    );
    expect(authApi.revokeUserSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          userId: "user_1",
        },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/users");
  });

  it("does not deactivate the current user", async () => {
    const formData = new FormData();
    formData.set("userId", "super_1");

    await deactivateUserAction(formData);

    expect(authApi.banUser).not.toHaveBeenCalled();
    expect(authApi.revokeUserSessions).not.toHaveBeenCalled();
  });

  it("revokes pending invites and refreshes the invites route", async () => {
    adminInvite.update.mockResolvedValueOnce({
      id: "invite_1",
      email: "admin@example.com",
      name: "Admin User",
      role: "ADMIN",
      tokenHash: "token-hash",
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: new Date(),
      revokedByUserId: "super_1",
      createdByUserId: "super_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const formData = new FormData();
    formData.set("inviteId", "invite_1");

    await revokeInviteAction(formData);

    expect(adminInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "invite_1",
          acceptedAt: null,
          revokedAt: null,
        },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/users/invites");
  });
});
