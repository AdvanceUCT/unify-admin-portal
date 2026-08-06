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
  VENDOR_HELP_EMAIL_FROM: "UNIFY Vendor Help <help@voskuils.com>",
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

  it("sends vendor help requests to the university contact email with reply metadata", async () => {
    stubValidEnv({ RESEND_API_KEY: "re_test_key", VENDOR_HELP_EMAIL_DELIVERY_MODE: "resend" });
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ id: "email_456" }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sendVendorHelpRequestEmail } = await import("@/lib/email/vendor-help");
    const result = await sendVendorHelpRequestEmail({
      details: "The verification QR code is not loading at our main branch.",
      submittedAt: new Date("2026-08-06T12:00:00.000Z"),
      submittedBy: {
        email: "vendor@example.test",
        name: "Vendor User",
      },
      title: "QR code issue",
      to: "support@example.edu",
      vendor: {
        companyName: "Campus Cafe",
        contactEmail: "owner@example.test",
        contactPersonName: "Owner User",
        role: "OWNER",
        serviceCategory: "Food services",
      },
    });

    expect(result).toEqual({ messageId: "email_456", provider: "resend" });
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body).toMatchObject({
      from: "UNIFY Vendor Help <help@voskuils.com>",
      headers: { "Reply-To": "vendor@example.test" },
      reply_to: "vendor@example.test",
      subject: "[UNIFY Vendor Help] QR code issue",
      to: "support@example.edu",
    });
    expect(body.text).toContain("Campus Cafe");
    expect(body.text).toContain("The verification QR code is not loading");
  });

  it("logs vendor help requests when console delivery is configured", async () => {
    stubValidEnv({ RESEND_API_KEY: "re_test_key", VENDOR_HELP_EMAIL_DELIVERY_MODE: "console" });
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendVendorHelpRequestEmail } = await import("@/lib/email/vendor-help");
    const result = await sendVendorHelpRequestEmail({
      details: "Please help us update our branch configuration.",
      submittedBy: {
        email: "vendor@example.test",
        name: "Vendor User",
      },
      title: "Branch configuration",
      to: "support@example.edu",
      vendor: {},
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("To: support@example.edu"));
  });

  it("requires a dedicated vendor help sender for Resend delivery", async () => {
    stubValidEnv({ RESEND_API_KEY: "re_test_key", VENDOR_HELP_EMAIL_FROM: "" });

    const { sendVendorHelpRequestEmail } = await import("@/lib/email/vendor-help");

    await expect(
      sendVendorHelpRequestEmail({
        details: "Please help us update our branch configuration.",
        submittedBy: {
          email: "vendor@example.test",
          name: "Vendor User",
        },
        title: "Branch configuration",
        to: "support@example.edu",
        vendor: {},
      }),
    ).rejects.toThrow("VENDOR_HELP_EMAIL_FROM is required to send vendor help request emails.");
  });
});
