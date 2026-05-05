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
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }

    await expect(import("@/lib/config/env")).resolves.toMatchObject({
      env: expect.objectContaining({
        DATABASE_URL: validEnv.DATABASE_URL,
        DIRECT_URL: validEnv.DIRECT_URL,
      }),
    });
  });
});
