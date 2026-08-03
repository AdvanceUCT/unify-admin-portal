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

describe("environment configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects copied Supabase placeholder connection strings", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );
    vi.stubEnv(
      "DIRECT_URL",
      "postgresql://postgres.project-ref:password@db.project-ref.supabase.co:5432/postgres",
    );

    for (const [key, value] of Object.entries(validEnv)) {
      if (key !== "DATABASE_URL" && key !== "DIRECT_URL") {
        vi.stubEnv(key, value);
      }
    }

    await expect(import("@/lib/config/env")).rejects.toThrow(
      "DATABASE_URL still contains placeholder Supabase values",
    );
  });

  it("accepts configured Supabase connection strings", async () => {
    stubValidEnv();

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({
        DATABASE_URL: validEnv.DATABASE_URL,
        DIRECT_URL: validEnv.DIRECT_URL,
      }),
    });
  });

  it("uses default agent timeout values when they are not configured", async () => {
    stubValidEnv();

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({
        AGENT_HEALTH_TIMEOUT_MS: 5_000,
        AGENT_LONG_TIMEOUT_MS: 60_000,
        AGENT_STANDARD_TIMEOUT_MS: 15_000,
      }),
    });
  });

  it("accepts configured positive integer agent timeout values", async () => {
    stubValidEnv({
      AGENT_HEALTH_TIMEOUT_MS: "2500",
      AGENT_LONG_TIMEOUT_MS: "120000",
      AGENT_STANDARD_TIMEOUT_MS: "20000",
    });

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({
        AGENT_HEALTH_TIMEOUT_MS: 2_500,
        AGENT_LONG_TIMEOUT_MS: 120_000,
        AGENT_STANDARD_TIMEOUT_MS: 20_000,
      }),
    });
  });

  it("rejects non-positive agent timeout values", async () => {
    stubValidEnv({ AGENT_STANDARD_TIMEOUT_MS: "0" });

    await expect(import("@/lib/config/env")).rejects.toThrow();
  });
});
