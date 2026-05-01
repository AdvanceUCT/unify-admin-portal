import { describe, expect, it, vi } from "vitest";

const betterAuthMock = vi.hoisted(() => vi.fn((options) => ({ options })));
const prismaAdapterMock = vi.hoisted(() => vi.fn(() => "prisma-adapter"));
const adminPluginMock = vi.hoisted(() => vi.fn((options) => ({ id: "admin", options })));

vi.mock("better-auth", () => ({
  betterAuth: betterAuthMock,
}));

vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: prismaAdapterMock,
}));

vi.mock("better-auth/plugins", () => ({
  admin: adminPluginMock,
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/email/password-reset", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

describe("auth configuration", () => {
  it("configures password reset expiry and session revocation", async () => {
    await import("@/lib/auth/auth");

    const options = betterAuthMock.mock.calls[0][0];

    expect(options.emailAndPassword.resetPasswordTokenExpiresIn).toBeLessThanOrEqual(60 * 60);
    expect(options.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
    expect(options.emailAndPassword.sendResetPassword).toEqual(expect.any(Function));
    expect(options.emailAndPassword.onPasswordReset).toEqual(expect.any(Function));
  });

});
