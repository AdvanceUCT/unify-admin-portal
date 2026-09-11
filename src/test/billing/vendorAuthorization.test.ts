import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getVendorInvoiceOwnerContext,
  requireVendorInvoiceOwnerContext,
  requireVendorInvoiceOwnerContextForRender,
} from "@/lib/billing/vendorAuthorization";
import { requireVendorSession, requireVendorSessionForRender } from "@/lib/auth/session";
import { forbidden } from "next/navigation";

const database = vi.hoisted(() => ({ vendorMembership: { findFirst: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/auth/session", () => ({
  requireVendorSession: vi.fn(),
  requireVendorSessionForRender: vi.fn(),
}));
vi.mock("next/navigation", () => ({ forbidden: vi.fn() }));

describe("getVendorInvoiceOwnerContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves an active owner's invoice context", async () => {
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      vendorProfile: { companyName: "Library Cafe" },
    });

    await expect(getVendorInvoiceOwnerContext("user-1")).resolves.toEqual({
      userId: "user-1",
      vendorProfileId: "vendor-1",
      companyName: "Library Cafe",
    });
  });

  it("scopes the membership lookup to an active OWNER role, not verification-application approval", async () => {
    database.vendorMembership.findFirst.mockResolvedValue(null);

    await getVendorInvoiceOwnerContext("user-1");

    expect(database.vendorMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", active: true, role: "OWNER" },
      }),
    );
    // Deliberately does NOT filter on vendorProfile.applications approval —
    // that is a different, unrelated concern from invoice ownership.
    const whereClause = database.vendorMembership.findFirst.mock.calls[0][0].where;
    expect(whereClause).not.toHaveProperty("vendorProfile");
  });

  it("returns null when there is no active owner membership", async () => {
    database.vendorMembership.findFirst.mockResolvedValue(null);

    await expect(getVendorInvoiceOwnerContext("user-1")).resolves.toBeNull();
  });
});

describe("requireVendorInvoiceOwnerContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls forbidden() for an authenticated vendor user with no owner membership (e.g. staff)", async () => {
    vi.mocked(requireVendorSession).mockResolvedValue({
      user: { id: "staff-user" },
    } as Awaited<ReturnType<typeof requireVendorSession>>);
    database.vendorMembership.findFirst.mockResolvedValue(null);
    vi.mocked(forbidden).mockImplementation(() => {
      throw new Error("forbidden");
    });

    await expect(requireVendorInvoiceOwnerContext()).rejects.toThrow("forbidden");
    expect(forbidden).toHaveBeenCalled();
  });

  it("returns the session and context for an active owner", async () => {
    const session = { user: { id: "owner-user" } } as Awaited<ReturnType<typeof requireVendorSession>>;
    vi.mocked(requireVendorSession).mockResolvedValue(session);
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      vendorProfile: { companyName: "Library Cafe" },
    });

    await expect(requireVendorInvoiceOwnerContext()).resolves.toEqual({
      session,
      context: { userId: "owner-user", vendorProfileId: "vendor-1", companyName: "Library Cafe" },
    });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("returns the session and context through the render guard for an active owner", async () => {
    const session = { user: { id: "owner-user" } } as Awaited<ReturnType<typeof requireVendorSessionForRender>>;
    vi.mocked(requireVendorSessionForRender).mockResolvedValue(session);
    database.vendorMembership.findFirst.mockResolvedValue({
      vendorProfileId: "vendor-1",
      vendorProfile: { companyName: "Library Cafe" },
    });

    await expect(requireVendorInvoiceOwnerContextForRender()).resolves.toEqual({
      session,
      context: { userId: "owner-user", vendorProfileId: "vendor-1", companyName: "Library Cafe" },
    });
    expect(database.vendorMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner-user", active: true, role: "OWNER" },
      }),
    );
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("calls forbidden() through the render guard for a vendor with no owner membership", async () => {
    vi.mocked(requireVendorSessionForRender).mockResolvedValue({
      user: { id: "staff-user" },
    } as Awaited<ReturnType<typeof requireVendorSessionForRender>>);
    database.vendorMembership.findFirst.mockResolvedValue(null);
    vi.mocked(forbidden).mockImplementation(() => {
      throw new Error("forbidden");
    });

    await expect(requireVendorInvoiceOwnerContextForRender()).rejects.toThrow("forbidden");
    expect(forbidden).toHaveBeenCalled();
  });
});
