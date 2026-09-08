/**
 * @fileoverview Guards the billing PostgreSQL integration suite from running in production.
 * @module lib/billing/testDatabaseGuard
 */

type BillingTestDatabaseEnv = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  DIRECT_URL?: string;
};

/**
 * Resolves the database URL for `test:billing:db`. Matches the existing
 * `test:payments:db` convention: reuse `DIRECT_URL` directly, isolated by a
 * uniquely named disposable schema the test creates and drops, rather than
 * requiring a wholly separate database.
 */
export function resolveBillingTestDirectUrl(env: BillingTestDatabaseEnv = process.env): string {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new Error("Refusing to run billing database tests in production.");
  }

  const directUrl = env.DIRECT_URL;
  if (!directUrl || directUrl.trim() === "") {
    throw new Error(
      "DIRECT_URL is required for billing PostgreSQL tests and must point to the migrated test database.",
    );
  }

  return directUrl;
}
