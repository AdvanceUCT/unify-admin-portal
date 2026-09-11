import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import SignInPage from "@/app/(public)/sign-in/page";
import { getCurrentAdminSessionForRender } from "@/lib/auth/session";

vi.mock("@/app/(public)/sign-in/SignInForm", () => ({
  SignInForm: vi.fn(() => null),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAdminSessionForRender: vi.fn(),
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

const getCurrentAdminSessionForRenderMock = vi.mocked(getCurrentAdminSessionForRender);

describe("sign-in page", () => {
  it("redirects signed-in users to the dashboard", async () => {
    getCurrentAdminSessionForRenderMock.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "SUPER_ADMIN",
      },
    } as Awaited<ReturnType<typeof getCurrentAdminSessionForRender>>);

    await expect(
      SignInPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
