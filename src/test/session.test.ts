import { forbidden, redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import {
  requireAdminSession,
  requireRole,
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
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
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

const session = {
  user: {
    id: "user_1",
    role: "SUPER_ADMIN",
    userType: "ADMIN",
  },
};

describe("session helpers", () => {
  it("redirects when an admin session is missing", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(requireAdminSession()).rejects.toThrow("redirect:/sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("returns the session when the required role is present", async () => {
    getSessionMock.mockResolvedValueOnce(session as Awaited<ReturnType<typeof auth.api.getSession>>);

    await expect(requireRole(["SUPER_ADMIN"])).resolves.toEqual(session);
  });

  it("renders forbidden when the required role is missing", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: {
        id: "user_2",
        role: "VIEWER",
        userType: "ADMIN",
      },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);

    await expect(requireRole(["SUPER_ADMIN"])).rejects.toThrow("forbidden");
    expect(forbidden).toHaveBeenCalled();
  });

  it("redirects a signed-in vendor to /vendor instead of showing 403", async () => {
    getSessionMock.mockResolvedValueOnce({
      user: {
        id: "vendor_1",
        role: null,
        userType: "VENDOR",
      },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);

    await expect(requireRole(["SUPER_ADMIN"])).rejects.toThrow("redirect:/vendor");
    expect(redirect).toHaveBeenCalledWith("/vendor");
  });
});
