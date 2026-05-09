import { afterEach, describe, expect, it, vi } from "vitest";

const validEnv = {
  ADMIN_INVITE_TTL_HOURS: "24",
  APP_URL: "http://localhost:3000",
  AUTH_EMAIL_FROM: "UNIFY Admin <admin@example.com>",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
  BOOTSTRAP_ADMIN_NAME: "Initial Super Admin",
  BOOTSTRAP_ADMIN_PASSWORD: "replace-with-a-strong-bootstrap-password",
  DATABASE_URL:
    "postgresql://postgres.realproject:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: "postgresql://postgres:secret@db.realproject.supabase.co:5432/postgres",
  NEXT_PUBLIC_API_BASE_URL: "mock://unify-admin",
};

describe("credential activation email delivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to console delivery in local runs when Resend is not configured", async () => {
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("CREDENTIAL_EMAIL_DELIVERY_MODE", "resend");
    vi.stubEnv("CREDENTIAL_EMAIL_FROM", "UNIFY Credentials <onboarding@resend.dev>");
    vi.stubGlobal("fetch", vi.fn());
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { sendCredentialActivationEmail } = await import("@/lib/email/credential-activation");
    const result = await sendCredentialActivationEmail({
      activationUrl: "unifywallet://activate?token=caleb-token",
      expiresAt: "2026-04-28T10:00:00.000Z",
      studentName: "Caleb Voskuil",
      to: "caleb.voskuil@gmail.com",
    });

    expect(result).toEqual({ provider: "console" });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Activation URL: unifywallet://activate?token=caleb-token"));
  });
});
