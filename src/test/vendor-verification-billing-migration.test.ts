import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260908120000_add_vendor_verification_billing_snapshots/migration.sql",
  ),
  "utf8",
);

describe("vendor verification billing migration", () => {
  it("adds event-level billing snapshot fields", () => {
    expect(migration).toContain("CREATE TYPE \"VendorVerificationBillingStatus\"");
    expect(migration).toContain('ADD COLUMN "billingStatus" "VendorVerificationBillingStatus" NOT NULL DEFAULT \'PENDING\'');
    expect(migration).toContain('ADD COLUMN "verificationFeeMinor" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('ADD COLUMN "verificationFeeCurrency" TEXT NOT NULL DEFAULT \'ZAR\'');
    expect(migration).toContain('ADD COLUMN "billingPeriodKey" TEXT');
    expect(migration).toContain('ADD COLUMN "pricingSnapshotAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "billingReason" TEXT');
  });

  it("adds billing validation and aggregation support", () => {
    expect(migration).toContain('CONSTRAINT "vendor_verification_fee_non_negative_check"');
    expect(migration).toContain('CONSTRAINT "vendor_verification_fee_currency_check"');
    expect(migration).toContain('CONSTRAINT "vendor_verification_billing_period_key_check"');
    expect(migration).toContain(
      'CREATE INDEX "vendor_verification_vendorProfileId_billingPeriodKey_billingStatus_idx"',
    );
  });
});
