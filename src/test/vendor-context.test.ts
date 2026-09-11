import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden } from "next/navigation";

import {
  getApprovedVendorContextForUser,
  requireApprovedVendorContext,
  requireApprovedVendorContextForRender,
  requireVendorOwnerContext,
  requireVendorOwnerContextForRender,
} from "@/lib/vendors/context";

const database = vi.hoisted(() => ({ vendorMembership: { findFirst: vi.fn() } }));
const auth = vi.hoisted(() => ({
  requireVendorSession: vi.fn(),
  requireVendorSessionForRender: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/auth/session", () => auth);
vi.mock("next/navigation", () => ({
  forbidden: vi.fn(() => {
    throw new Error("forbidden");
  }),
}));

describe("approved vendor context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives an owner access to every active branch", async () => {
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "OWNER",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }, { id: "branch-2" }] },
      branches: [],
    });
    await expect(getApprovedVendorContextForUser("user-1")).resolves.toEqual({
      userId: "user-1",
      vendorProfileId: "vendor-1",
      companyName: "Cafe",
      role: "OWNER",
      branchIds: ["branch-1", "branch-2"],
    });
  });

  it("limits staff to assigned active branches", async () => {
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "STAFF",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }, { id: "branch-2" }] },
      branches: [{ vendorBranchId: "branch-2" }],
    });
    const context = await getApprovedVendorContextForUser("staff-1");
    expect(context?.branchIds).toEqual(["branch-2"]);
  });

  it("uses a narrow membership select without changing branch-scope behavior", async () => {
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "OWNER",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }] },
      branches: [],
    });

    await getApprovedVendorContextForUser("user-1");

    expect(database.vendorMembership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        active: true,
        vendorProfile: { applications: { some: { status: "APPROVED" } } },
      },
      select: {
        vendorProfileId: true,
        role: true,
        vendorProfile: {
          select: {
            companyName: true,
            branches: { select: { id: true } },
          },
        },
        branches: {
          where: { vendorBranch: { active: true } },
          select: { vendorBranchId: true },
        },
      },
    });
  });

  it("requires an approved vendor context through the fresh guard", async () => {
    const session = { user: { id: "owner-1" } };
    auth.requireVendorSession.mockResolvedValue(session);
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "OWNER",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }] },
      branches: [],
    });

    await expect(requireApprovedVendorContext()).resolves.toEqual({
      session,
      context: {
        userId: "owner-1",
        vendorProfileId: "vendor-1",
        companyName: "Cafe",
        role: "OWNER",
        branchIds: ["branch-1"],
      },
    });
  });

  it("requires owner role through the fresh guard", async () => {
    auth.requireVendorSession.mockResolvedValue({ user: { id: "staff-1" } });
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "STAFF",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }] },
      branches: [{ vendorBranchId: "branch-1" }],
    });

    await expect(requireVendorOwnerContext()).rejects.toThrow("forbidden");
    expect(forbidden).toHaveBeenCalled();
  });

  it("requires an approved vendor context through the render guard", async () => {
    const session = { user: { id: "owner-1" } };
    auth.requireVendorSessionForRender.mockResolvedValue(session);
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "OWNER",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }] },
      branches: [],
    });

    await expect(requireApprovedVendorContextForRender()).resolves.toEqual({
      session,
      context: {
        userId: "owner-1",
        vendorProfileId: "vendor-1",
        companyName: "Cafe",
        role: "OWNER",
        branchIds: ["branch-1"],
      },
    });
  });

  it("requires owner role through the render guard", async () => {
    auth.requireVendorSessionForRender.mockResolvedValue({ user: { id: "staff-1" } });
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      role: "STAFF",
      vendorProfile: { companyName: "Cafe", branches: [{ id: "branch-1" }] },
      branches: [{ vendorBranchId: "branch-1" }],
    });

    await expect(requireVendorOwnerContextForRender()).rejects.toThrow("forbidden");
    expect(forbidden).toHaveBeenCalled();
  });
});
