import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptVendorStaffInvite, setVendorStaffActive } from "@/lib/vendors/staff";

const auth = vi.hoisted(() => ({ api: { createUser: vi.fn() } }));
const email = vi.hoisted(() => ({ sendVendorStaffInviteEmail: vi.fn() }));
const database = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), deleteMany: vi.fn() },
  vendorStaffInvite: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  vendorMembership: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  vendorBranchMembership: { createMany: vi.fn() },
  session: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/auth", () => ({ auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/email/vendor-staff-invites", () => email);
vi.mock("@/lib/config/env", () => ({ env: { ADMIN_INVITE_TTL_HOURS: 24, APP_URL: "https://portal.example.test" } }));

describe("vendor staff lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.$transaction.mockImplementation(async (operation) => operation(database));
  });

  it("accepts one invite into a multi-branch staff membership", async () => {
    const token = "valid-token";
    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    database.vendorStaffInvite.findUnique.mockResolvedValue({
      id: "invite-1",
      tokenHash,
      email: "staff@example.test",
      name: "Staff User",
      vendorProfileId: "vendor-1",
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null,
      vendorProfile: { companyName: "Cafe" },
      branches: [{ vendorBranchId: "branch-1", vendorBranch: { name: "Main" } }, { vendorBranchId: "branch-2", vendorBranch: { name: "Campus" } }],
    });
    database.user.findUnique.mockResolvedValue(null);
    database.vendorStaffInvite.updateMany.mockResolvedValue({ count: 1 });
    auth.api.createUser.mockResolvedValue({ user: { id: "staff-user-1" } });
    database.vendorMembership.create.mockResolvedValue({ id: "membership-1" });

    await acceptVendorStaffInvite({ token, password: "very-secure-password", confirmPassword: "very-secure-password" });
    expect(database.vendorMembership.create).toHaveBeenCalledWith({ data: { vendorProfileId: "vendor-1", userId: "staff-user-1", role: "STAFF" } });
    expect(database.vendorBranchMembership.createMany).toHaveBeenCalledWith({ data: [
      { vendorMembershipId: "membership-1", vendorBranchId: "branch-1" },
      { vendorMembershipId: "membership-1", vendorBranchId: "branch-2" },
    ] });
  });

  it("revokes active sessions when staff access is disabled", async () => {
    database.vendorMembership.findFirst.mockResolvedValue({ id: "membership-1", userId: "staff-user-1" });
    await setVendorStaffActive("vendor-1", "membership-1", false);
    expect(database.vendorMembership.update).toHaveBeenCalledWith({ where: { id: "membership-1" }, data: { active: false } });
    expect(database.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "staff-user-1" } });
  });
});
