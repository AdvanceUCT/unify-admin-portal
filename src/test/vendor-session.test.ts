import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  requireApprovedVendorSession,
  requireVendorSession,
} from "@/lib/auth/session";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  forbidden: vi.fn(() => {
    throw new Error("forbidden");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vendorProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    vendorApplication: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const { auth } = await import("@/lib/auth/auth");
const getSessionMock = vi.mocked(auth.api.getSession);
const vendorProfile = vi.mocked(prisma.vendorProfile);
const vendorApplication = vi.mocked(prisma.vendorApplication);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireVendorSession", () => {
  it("redirects to /vendor/sign-in when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(requireVendorSession()).rejects.toThrow("redirect:/vendor/sign-in");
    expect(redirect).toHaveBeenCalledWith("/vendor/sign-in");
  });

  it("redirects an admin session to / instead of allowing vendor access", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: {
        id: "admin_1",
        role: "SUPER_ADMIN",
        userType: "ADMIN",
      },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);

    await expect(requireVendorSession()).rejects.toThrow("redirect:/");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns the session for a signed-in vendor", async () => {
    const session = {
      user: {
        id: "vendor_1",
        role: null,
        userType: "VENDOR",
      },
    };
    getSessionMock.mockResolvedValueOnce(session as Awaited<ReturnType<typeof auth.api.getSession>>);

    await expect(requireVendorSession()).resolves.toEqual(session);
  });
});

describe("requireApprovedVendorSession", () => {
  const vendorSession = {
    user: {
      id: "vendor_1",
      role: null,
      userType: "VENDOR",
    },
  };

  it("returns an approved vendor session", async () => {
    getSessionMock.mockResolvedValueOnce(
      vendorSession as Awaited<ReturnType<typeof auth.api.getSession>>,
    );
    vendorProfile.findUnique.mockResolvedValueOnce({
      id: "profile_1",
      userId: "vendor_1",
      parentVendorProfileId: null,
      companyName: "Demo Vendor",
      serviceCategory: "Retail",
      locationName: null,
      locationAddress: null,
      contactPersonName: "Vendor User",
      contactEmail: "vendor@example.com",
      verificationUrl: null,
      parentVendorProfile: null,
    } as never);
    vendorApplication.findFirst.mockResolvedValueOnce({ id: "application_1" } as never);
    vendorProfile.findMany.mockResolvedValueOnce([]);

    await expect(requireApprovedVendorSession()).resolves.toEqual(vendorSession);
    expect(vendorProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "vendor_1" },
      select: expect.any(Object),
    });
    expect(vendorApplication.findFirst).toHaveBeenCalledWith({
      where: {
        vendorProfileId: "profile_1",
        status: "APPROVED",
      },
      select: { id: true },
    });
  });

  it("forbids a vendor without current approval", async () => {
    getSessionMock.mockResolvedValueOnce(
      vendorSession as Awaited<ReturnType<typeof auth.api.getSession>>,
    );
    vendorProfile.findUnique.mockResolvedValueOnce({
      id: "profile_1",
      userId: "vendor_1",
      parentVendorProfileId: null,
      companyName: "Demo Vendor",
      serviceCategory: "Retail",
      locationName: null,
      locationAddress: null,
      contactPersonName: "Vendor User",
      contactEmail: "vendor@example.com",
      verificationUrl: null,
      parentVendorProfile: null,
    } as never);
    vendorApplication.findFirst.mockResolvedValueOnce(null);
    vendorProfile.findMany.mockResolvedValueOnce([]);

    await expect(requireApprovedVendorSession()).rejects.toThrow("forbidden");
  });

  it("allows a sub-vendor when the parent vendor is approved", async () => {
    getSessionMock.mockResolvedValueOnce(
      vendorSession as Awaited<ReturnType<typeof auth.api.getSession>>,
    );
    vendorProfile.findUnique.mockResolvedValueOnce({
      id: "location_1",
      userId: "vendor_1",
      parentVendorProfileId: "profile_1",
      companyName: "Demo Vendor",
      serviceCategory: "Retail",
      locationName: "Cape Town Branch",
      locationAddress: null,
      contactPersonName: "Vendor User",
      contactEmail: "vendor@example.com",
      verificationUrl: null,
      parentVendorProfile: {
        id: "profile_1",
        companyName: "Demo Vendor",
        serviceCategory: "Retail",
        verificationUrl: null,
      },
    } as never);
    vendorApplication.findFirst.mockResolvedValueOnce({ id: "application_1" } as never);

    await expect(requireApprovedVendorSession()).resolves.toEqual(vendorSession);
    expect(vendorApplication.findFirst).toHaveBeenCalledWith({
      where: {
        vendorProfileId: "profile_1",
        status: "APPROVED",
      },
      select: { id: true },
    });
    expect(vendorProfile.findMany).not.toHaveBeenCalled();
  });
});
