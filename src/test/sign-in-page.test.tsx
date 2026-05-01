import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import SignInPage from "@/app/(public)/sign-in/page";
import { getCurrentAdminSession } from "@/lib/auth/session";

vi.mock("@/app/(public)/sign-in/SignInForm", () => ({
  SignInForm: vi.fn(() => null),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAdminSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const getCurrentAdminSessionMock = vi.mocked(getCurrentAdminSession);

describe("sign-in page", () => {
  it("redirects signed-in users to the dashboard", async () => {
    getCurrentAdminSessionMock.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "SUPER_ADMIN",
      },
    } as Awaited<ReturnType<typeof getCurrentAdminSession>>);

    await expect(
      SignInPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
