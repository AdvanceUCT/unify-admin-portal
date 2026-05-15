import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validEnv = {
  ADMIN_INVITE_TTL_HOURS: "24",
  APP_URL: "https://voskuils.com",
  AUTH_EMAIL_FROM: "UNIFY Admin <admin@voskuils.com>",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "https://voskuils.com",
  BOOTSTRAP_ADMIN_EMAIL: "admin@voskuils.com",
  BOOTSTRAP_ADMIN_NAME: "Initial Super Admin",
  BOOTSTRAP_ADMIN_PASSWORD: "replace-with-a-strong-bootstrap-password",
  DATABASE_URL:
    "postgresql://postgres.realproject:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: "postgresql://postgres:secret@db.realproject.supabase.co:5432/postgres",
  NEXT_PUBLIC_API_BASE_URL: "mock://unify-admin",
};

function stubValidEnv(overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...validEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

describe("auth email delivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("logs admin invites in non-production runs", async () => {
    stubValidEnv();
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendAdminInviteEmail } = await import("@/lib/email/admin-invites");
    const result = await sendAdminInviteEmail({
      expiresAt: new Date("2026-05-14T12:00:00.000Z"),
      inviteUrl: "https://voskuils.com/accept-invite?token=invite-token",
      name: "Admin User",
      to: "admin@voskuils.com",
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Invite URL: https://voskuils.com/accept-invite?token=invite-token"),
    );
  });

  it("sends password reset emails through Resend in production", async () => {
    stubValidEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_test_key" });
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ id: "email_123" }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sendPasswordResetEmail } = await import("@/lib/email/password-reset");
    const result = await sendPasswordResetEmail({
      expiresInMinutes: 60,
      name: "Admin User",
      resetUrl: "https://voskuils.com/reset-password?token=reset-token",
      to: "admin@voskuils.com",
    });

    expect(result).toEqual({ messageId: "email_123", provider: "resend" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
      }),
    );

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body).toMatchObject({
      from: "UNIFY Admin <admin@voskuils.com>",
      subject: "Reset your UNIFY Admin Portal password",
      to: "admin@voskuils.com",
    });
    expect(body.text).toContain("https://voskuils.com/reset-password?token=reset-token");
  });

  it("requires Resend for admin invites in production", async () => {
    stubValidEnv({ NODE_ENV: "production" });

    const { sendAdminInviteEmail } = await import("@/lib/email/admin-invites");

    await expect(
      sendAdminInviteEmail({
        expiresAt: new Date("2026-05-14T12:00:00.000Z"),
        inviteUrl: "https://voskuils.com/accept-invite?token=invite-token",
        name: "Admin User",
        to: "admin@voskuils.com",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send admin invite emails.");
  });
});
