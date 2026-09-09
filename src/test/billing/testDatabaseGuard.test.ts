import { describe, expect, it } from "vitest";

import { resolveBillingTestDirectUrl } from "@/lib/billing/testDatabaseGuard";

const DIRECT_URL = "postgresql://dev:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

describe("resolveBillingTestDirectUrl", () => {
  it("refuses to run when NODE_ENV is production", () => {
    expect(() => resolveBillingTestDirectUrl({ DIRECT_URL, NODE_ENV: "production" })).toThrow(
      "Refusing to run billing database tests in production.",
    );
  });

  it("refuses to run when VERCEL_ENV is production", () => {
    expect(() => resolveBillingTestDirectUrl({ DIRECT_URL, VERCEL_ENV: "production" })).toThrow(
      "Refusing to run billing database tests in production.",
    );
  });

  it("requires DIRECT_URL", () => {
    expect(() => resolveBillingTestDirectUrl({})).toThrow("DIRECT_URL is required");
  });

  it("rejects a blank DIRECT_URL", () => {
    expect(() => resolveBillingTestDirectUrl({ DIRECT_URL: "   " })).toThrow("DIRECT_URL is required");
  });

  it("returns DIRECT_URL when it is configured and the environment is not production", () => {
    expect(resolveBillingTestDirectUrl({ DIRECT_URL })).toBe(DIRECT_URL);
  });
});
