import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVendorBranch, setVendorBranchActive } from "@/lib/vendors/branches";

const agent = vi.hoisted(() => ({
  AgentServiceError: class AgentServiceError extends Error { constructor(message: string, public status: number) { super(message); } },
  createVerificationServicePoint: vi.fn(),
  listVerificationServicePoints: vi.fn(),
  updateVerificationServicePoint: vi.fn(),
}));
const audit = vi.hoisted(() => ({ writeAuditLog: vi.fn() }));
const database = vi.hoisted(() => ({
  vendorBranch: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  vendorProfile: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agentClient", () => agent);
vi.mock("@/lib/audit/audit", () => audit);
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

describe("vendor branches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a distinct agent service point for a branch", async () => {
    database.vendorBranch.create.mockResolvedValue({ id: "branch-1" });
    database.vendorBranch.findUnique.mockResolvedValue({
      id: "branch-1",
      vendorProfileId: "vendor-1",
      name: "Waterfront",
      agentServicePointId: null,
      verificationUrl: null,
      vendorProfile: { companyName: "Cafe" },
    });
    agent.createVerificationServicePoint.mockResolvedValue({ id: "service-point-1", verificationUrl: "https://example.test/verify/public-1" });
    database.vendorBranch.update.mockResolvedValue({ id: "branch-1", status: "ACTIVE" });

    await createVendorBranch("vendor-1", "owner-1", { name: " Waterfront ", address: "Dock Road" });
    expect(database.vendorBranch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Waterfront", normalizedName: "waterfront" }) });
    expect(agent.createVerificationServicePoint).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      vendorName: "Cafe",
      externalId: "branch-1",
      name: "Waterfront",
    });
    expect(audit.writeAuditLog).toHaveBeenCalledWith({
      action: "VENDOR_BRANCH_CREATED",
      actorId: "owner-1",
      targetType: "vendor_branch",
      targetId: "branch-1",
      meta: {
        vendorProfileId: "vendor-1",
        name: "Waterfront",
        status: "ACTIVE",
      },
    });
  });

  it("does not disable the default checkout branch", async () => {
    database.vendorBranch.findFirst.mockResolvedValue({ id: "branch-1", agentServicePointId: "service-point-1" });
    database.vendorProfile.findUnique.mockResolvedValue({ defaultBranchId: "branch-1" });
    await expect(setVendorBranchActive("vendor-1", "branch-1", "owner-1", false)).rejects.toThrow("Choose another default branch");
    expect(agent.updateVerificationServicePoint).not.toHaveBeenCalled();
    expect(audit.writeAuditLog).not.toHaveBeenCalled();
  });

  it("audits branch deactivation after disabling the agent service point", async () => {
    database.vendorBranch.findFirst.mockResolvedValue({
      id: "branch-1",
      agentServicePointId: "service-point-1",
    });
    database.vendorProfile.findUnique.mockResolvedValue({ defaultBranchId: "branch-2" });
    database.vendorBranch.update.mockResolvedValue({ id: "branch-1", status: "DISABLED" });

    await setVendorBranchActive("vendor-1", "branch-1", "owner-1", false);

    expect(agent.updateVerificationServicePoint).toHaveBeenCalledWith("service-point-1", { active: false });
    expect(audit.writeAuditLog).toHaveBeenCalledWith({
      action: "VENDOR_BRANCH_STATUS_CHANGED",
      actorId: "owner-1",
      targetType: "vendor_branch",
      targetId: "branch-1",
      meta: { vendorProfileId: "vendor-1", status: "DISABLED" },
    });
  });
});
