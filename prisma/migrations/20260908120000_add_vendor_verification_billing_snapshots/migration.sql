-- Add event-level verification billing snapshots.
-- Pricing is platform-controlled in v1, but each completed verification stores
-- the applied billing result so later price changes do not rewrite history.

CREATE TYPE "VendorVerificationBillingStatus" AS ENUM ('PENDING', 'BILLABLE', 'NOT_BILLABLE');

ALTER TABLE "vendor_verification"
ADD COLUMN "billingStatus" "VendorVerificationBillingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "verificationFeeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "verificationFeeCurrency" TEXT NOT NULL DEFAULT 'ZAR',
ADD COLUMN "billingPeriodKey" TEXT,
ADD COLUMN "pricingSnapshotAt" TIMESTAMP(3),
ADD COLUMN "billingReason" TEXT;

ALTER TABLE "vendor_verification"
ADD CONSTRAINT "vendor_verification_fee_non_negative_check"
CHECK ("verificationFeeMinor" >= 0);

ALTER TABLE "vendor_verification"
ADD CONSTRAINT "vendor_verification_fee_currency_check"
CHECK ("verificationFeeCurrency" ~ '^[A-Z]{3}$');

ALTER TABLE "vendor_verification"
ADD CONSTRAINT "vendor_verification_billing_period_key_check"
CHECK ("billingPeriodKey" IS NULL OR "billingPeriodKey" ~ '^[0-9]{4}-[0-9]{2}$');

CREATE INDEX "vendor_verification_vendorProfileId_billingPeriodKey_billingStatus_idx"
ON "vendor_verification"("vendorProfileId", "billingPeriodKey", "billingStatus");
