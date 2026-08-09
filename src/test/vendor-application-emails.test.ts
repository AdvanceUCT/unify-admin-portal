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

describe("vendor application email delivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("logs submitted-application emails in non-production runs", async () => {
    stubValidEnv();
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendVendorApplicationSubmittedEmail } = await import(
      "@/lib/email/vendor-application-submitted"
    );
    const result = await sendVendorApplicationSubmittedEmail({
      companyName: "Acme Verifiers",
      contactName: "Jordan Vendor",
      to: "jordan@acme-verifiers.test",
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Company: Acme Verifiers"));
  });

  it("logs approved-application emails in non-production runs", async () => {
    stubValidEnv();
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendVendorApplicationApprovedEmail } = await import(
      "@/lib/email/vendor-application-approved"
    );
    const result = await sendVendorApplicationApprovedEmail({
      companyName: "Acme Verifiers",
      contactName: "Jordan Vendor",
      portalUrl: "https://voskuils.com/vendor",
      to: "jordan@acme-verifiers.test",
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Portal URL: https://voskuils.com/vendor"),
    );
  });

  it("logs rejected-application emails in non-production runs", async () => {
    stubValidEnv();
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendVendorApplicationRejectedEmail } = await import(
      "@/lib/email/vendor-application-rejected"
    );
    const result = await sendVendorApplicationRejectedEmail({
      applicationUrl: "https://voskuils.com/vendor/application",
      companyName: "Acme Verifiers",
      contactName: "Jordan Vendor",
      reason: "Missing proof of address.",
      to: "jordan@acme-verifiers.test",
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Reason: Missing proof of address."),
    );
  });

  it("logs revoked-application emails in non-production runs", async () => {
    stubValidEnv();
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendVendorApplicationRevokedEmail } = await import(
      "@/lib/email/vendor-application-revoked"
    );
    const result = await sendVendorApplicationRevokedEmail({
      companyName: "Acme Verifiers",
      contactName: "Jordan Vendor",
      reason: "Failed a compliance audit.",
      to: "jordan@acme-verifiers.test",
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Reason: Failed a compliance audit."),
    );
  });

  it("sends approved-application emails through Resend in production", async () => {
    stubValidEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_test_key" });
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ id: "email_123" }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sendVendorApplicationApprovedEmail } = await import(
      "@/lib/email/vendor-application-approved"
    );
    const result = await sendVendorApplicationApprovedEmail({
      companyName: "Acme Verifiers",
      contactName: "Jordan Vendor",
      portalUrl: "https://voskuils.com/vendor",
      to: "jordan@acme-verifiers.test",
    });

    expect(result).toEqual({ messageId: "email_123", provider: "resend" });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body).toMatchObject({
      from: "UNIFY Admin <admin@voskuils.com>",
      subject: "Your UNIFY verifier application has been approved",
      to: "jordan@acme-verifiers.test",
    });
    expect(body.text).toContain("https://voskuils.com/vendor");
  });

  it("requires Resend for vendor application emails in production", async () => {
    stubValidEnv({ NODE_ENV: "production" });

    const { sendVendorApplicationSubmittedEmail } = await import(
      "@/lib/email/vendor-application-submitted"
    );

    await expect(
      sendVendorApplicationSubmittedEmail({
        companyName: "Acme Verifiers",
        contactName: "Jordan Vendor",
        to: "jordan@acme-verifiers.test",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send vendor application submitted emails.");
  });
});
