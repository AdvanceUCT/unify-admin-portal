import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVendorVerificationQrAction,
  markVendorApplicationViewedAction,
  rejectVendorApplicationAction,
} from "@/app/(admin)/vendors/actions";
import { requireRole } from "@/lib/auth/session";
import {
  ensureVendorVerificationServicePoint,
  markApplicationViewed,
  reviewVendorApplication,
} from "@/lib/vendors/applications";
import { revalidatePath } from "next/cache";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/vendors/applications", () => ({
  ensureVendorVerificationServicePoint: vi.fn(),
  markApplicationViewed: vi.fn(),
  reviewVendorApplication: vi.fn(),
  revokeVendorApplication: vi.fn(),
}));

const requireRoleMock = vi.mocked(requireRole);
const ensureVendorVerificationServicePointMock = vi.mocked(ensureVendorVerificationServicePoint);
const markApplicationViewedMock = vi.mocked(markApplicationViewed);
const reviewVendorApplicationMock = vi.mocked(reviewVendorApplication);
const revalidatePathMock = vi.mocked(revalidatePath);

describe("vendor application actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      user: {
        id: "admin_1",
        role: "ADMIN",
      },
    } as Awaited<ReturnType<typeof requireRole>>);
  });

  it("passes the required rejection reason to the application service", async () => {
    const formData = new FormData();
    formData.set("applicationId", "application_1");
    formData.set("notes", "Registration details could not be verified.");

    await rejectVendorApplicationAction(formData);

    expect(reviewVendorApplicationMock).toHaveBeenCalledWith({
      applicationId: "application_1",
      decision: "REJECTED",
      reviewerId: "admin_1",
      notes: "Registration details could not be verified.",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/vendors", "layout");
  });

  it("does not call the service when the rejection reason is empty", async () => {
    const formData = new FormData();
    formData.set("applicationId", "application_1");
    formData.set("notes", "   ");

    await expect(rejectVendorApplicationAction(formData)).rejects.toThrow(
      "A rejection reason is required",
    );
    expect(reviewVendorApplicationMock).not.toHaveBeenCalled();
  });

  it("marks an application viewed through an authenticated server action", async () => {
    await markVendorApplicationViewedAction("application_1");

    expect(markApplicationViewedMock).toHaveBeenCalledWith({
      applicationId: "application_1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/vendors");
  });

  it("creates a verification QR for an approved vendor", async () => {
    const formData = new FormData();
    formData.set("vendorProfileId", "profile_1");

    await createVendorVerificationQrAction(formData);

    expect(ensureVendorVerificationServicePointMock).toHaveBeenCalledWith("profile_1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/vendors", "layout");
    expect(revalidatePathMock).toHaveBeenCalledWith("/vendor");
  });
});
