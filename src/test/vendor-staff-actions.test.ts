import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStaffInviteAction } from "@/app/vendor/(portal)/staff/actions";
import { requireVendorOwnerContext } from "@/lib/vendors/context";
import { createVendorStaffInvite } from "@/lib/vendors/staff";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/vendors/context", () => ({
  requireVendorOwnerContext: vi.fn(),
}));

vi.mock("@/lib/vendors/staff", () => ({
  createVendorStaffInvite: vi.fn(),
  revokeVendorStaffInvite: vi.fn(),
  setVendorStaffActive: vi.fn(),
  updateVendorStaffBranches: vi.fn(),
}));

const requireVendorOwnerContextMock = vi.mocked(requireVendorOwnerContext);
const createVendorStaffInviteMock = vi.mocked(createVendorStaffInvite);

function inviteForm(branchIds: string[] = []) {
  const formData = new FormData();
  formData.set("name", "Staff User");
  formData.set("email", "staff@example.test");
  for (const branchId of branchIds) formData.append("branchId", branchId);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireVendorOwnerContextMock.mockResolvedValue({
    context: { vendorProfileId: "vendor_1" },
    session: { user: { id: "owner_1" } },
  } as never);
});

describe("createStaffInviteAction", () => {
  it("returns a friendly error when no branch is selected", async () => {
    const result = await createStaffInviteAction({}, inviteForm());

    expect(result).toEqual(expect.objectContaining({
      error: "Select at least one branch before sending the invite.",
      values: {
        branchIds: [],
        email: "staff@example.test",
        name: "Staff User",
      },
    }));
    expect(createVendorStaffInviteMock).not.toHaveBeenCalled();
  });

  it("creates an invite when at least one branch is selected", async () => {
    createVendorStaffInviteMock.mockResolvedValue({ id: "invite_1" } as never);

    const result = await createStaffInviteAction({}, inviteForm(["branch_1"]));

    expect(result).toEqual(expect.objectContaining({ success: "Invite created." }));
    expect(createVendorStaffInviteMock).toHaveBeenCalledWith("vendor_1", "owner_1", {
      branchIds: ["branch_1"],
      email: "staff@example.test",
      name: "Staff User",
    });
  });
});
