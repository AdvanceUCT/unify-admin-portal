import { beforeEach, describe, expect, it, vi } from "vitest";

import { getApprovedVendorContextForUser } from "@/lib/vendors/context";

const database = vi.hoisted(() => ({ vendorMembership: { findFirst: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/auth/session", () => ({ requireVendorSession: vi.fn() }));

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
});
