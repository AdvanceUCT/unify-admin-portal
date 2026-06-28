import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import { requireVendorSession } from "@/lib/auth/session";

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
