import { afterEach, describe, expect, it, vi } from "vitest";

const validEnv = {
  DATABASE_URL:
    "postgresql://postgres.realproject:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: "postgresql://postgres:secret@db.realproject.supabase.co:5432/postgres",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
  BOOTSTRAP_ADMIN_NAME: "Initial Super Admin",
  BOOTSTRAP_ADMIN_PASSWORD: "replace-with-a-strong-bootstrap-password",
  ADMIN_INVITE_TTL_HOURS: "24",
  AUTH_EMAIL_FROM: "UNIFY Admin <admin@example.com>",
  NEXT_PUBLIC_API_BASE_URL: "mock://unify-admin",
};

function stubValidEnv(overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...validEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

const validPaystackVars = {
  PAYSTACK_SECRET_KEY: "sk_test_abc123",
  PAYSTACK_PLATFORM_SUBACCOUNT_CODE: "ACCT_xyz789",
  PAYSTACK_EXPECTED_INTEGRATION_ID: "123456",
};

describe("vendor invoicing environment configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults invoicing/checkout off and mode to test when unset", async () => {
    stubValidEnv();

    const { env } = await import("@/lib/config/env");

    expect(env).toMatchObject({
      VERIFICATION_INVOICING_ENABLED: false,
      VERIFICATION_INVOICE_CHECKOUT_ENABLED: false,
      PAYSTACK_MODE: "test",
      PAYSTACK_ACCOUNT_REF: "university-demo",
    });
    expect(env.PAYSTACK_SECRET_KEY).toBeUndefined();
  });

  it("rejects a malformed boolean flag instead of silently defaulting it", async () => {
    stubValidEnv({ VERIFICATION_INVOICING_ENABLED: "yes" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "VERIFICATION_INVOICING_ENABLED must be",
    );
  });

  it("rejects live Paystack mode outright", async () => {
    stubValidEnv({ PAYSTACK_MODE: "live" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "PAYSTACK_MODE must be",
    );
  });

  it("rejects a live secret key even though PAYSTACK_MODE is test", async () => {
    stubValidEnv({ PAYSTACK_SECRET_KEY: "sk_live_abc123" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "PAYSTACK_SECRET_KEY must be a real Paystack test secret key",
    );
  });

  it("rejects the setup-guide placeholder secret key", async () => {
    stubValidEnv({ PAYSTACK_SECRET_KEY: "sk_test_REPLACE_IN_PRIVATE_ENV" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "PAYSTACK_SECRET_KEY must be a real Paystack test secret key",
    );
  });

  it("rejects the setup-guide placeholder subaccount code", async () => {
    stubValidEnv({ PAYSTACK_PLATFORM_SUBACCOUNT_CODE: "ACCT_REPLACE_WITH_TEST_CODE" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "PAYSTACK_PLATFORM_SUBACCOUNT_CODE must be a real Paystack subaccount code",
    );
  });

  it("rejects the setup-guide placeholder integration id", async () => {
    stubValidEnv({ PAYSTACK_EXPECTED_INTEGRATION_ID: "REPLACE_WITH_CHECKED_INTEGRATION_ID" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "PAYSTACK_EXPECTED_INTEGRATION_ID must not be left as the setup-guide placeholder",
    );
  });

  it("rejects a subaccount code missing the ACCT_ prefix", async () => {
    stubValidEnv({ PAYSTACK_PLATFORM_SUBACCOUNT_CODE: "not-a-real-code" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "PAYSTACK_PLATFORM_SUBACCOUNT_CODE must be a real Paystack subaccount code",
    );
  });

  it("allows invoicing to be enabled without any Paystack configuration", async () => {
    stubValidEnv({ VERIFICATION_INVOICING_ENABLED: "true" });

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({
        VERIFICATION_INVOICING_ENABLED: true,
        VERIFICATION_INVOICE_CHECKOUT_ENABLED: false,
      }),
    });
  });

  it("refuses to enable checkout without the required Paystack identity", async () => {
    stubValidEnv({ VERIFICATION_INVOICE_CHECKOUT_ENABLED: "true" });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "VERIFICATION_INVOICE_CHECKOUT_ENABLED requires PAYSTACK_SECRET_KEY, PAYSTACK_PLATFORM_SUBACCOUNT_CODE, PAYSTACK_EXPECTED_INTEGRATION_ID to be configured.",
    );
  });

  it("refuses to enable checkout with only some of the required Paystack identity configured", async () => {
    stubValidEnv({
      VERIFICATION_INVOICE_CHECKOUT_ENABLED: "true",
      PAYSTACK_SECRET_KEY: validPaystackVars.PAYSTACK_SECRET_KEY,
    });

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "VERIFICATION_INVOICE_CHECKOUT_ENABLED requires PAYSTACK_PLATFORM_SUBACCOUNT_CODE, PAYSTACK_EXPECTED_INTEGRATION_ID to be configured.",
    );
  });

  it("enables checkout once every required Paystack identity value is configured", async () => {
    stubValidEnv({
      VERIFICATION_INVOICE_CHECKOUT_ENABLED: "true",
      ...validPaystackVars,
    });

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({
        VERIFICATION_INVOICE_CHECKOUT_ENABLED: true,
        PAYSTACK_SECRET_KEY: validPaystackVars.PAYSTACK_SECRET_KEY,
        PAYSTACK_PLATFORM_SUBACCOUNT_CODE: validPaystackVars.PAYSTACK_PLATFORM_SUBACCOUNT_CODE,
        PAYSTACK_EXPECTED_INTEGRATION_ID: validPaystackVars.PAYSTACK_EXPECTED_INTEGRATION_ID,
      }),
    });
  });

  it("accepts an explicit PAYSTACK_ACCOUNT_REF instead of the default", async () => {
    stubValidEnv({ PAYSTACK_ACCOUNT_REF: "my-university" });

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({ PAYSTACK_ACCOUNT_REF: "my-university" }),
    });
  });
});
