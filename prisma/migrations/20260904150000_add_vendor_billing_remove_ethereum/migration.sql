-- Vendor billing: overdue invoice tracking, verification-rate config, and
-- vendor payment suspension. Written by hand (rather than generated from a
-- full schema diff) because the shared dev database also carries an
-- unrelated, unmerged "sub-vendor" feature (vendor_invite table,
-- parentVendorProfileId/locationAddress/locationName on vendor_profile) and
-- extra AuditAction values from that branch. Those are intentionally left
-- untouched here.

-- AlterEnum (additive only — safe regardless of existing rows)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_INVOICE_FLAGGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_SUSPENDED_FOR_BILLING';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_BILLING_REINSTATED';

-- AlterTable
ALTER TABLE "vendor_profile"
  ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'GOOD_STANDING',
  ADD COLUMN "suspendedForBilling" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "vendor_invoice" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "ratePerVerification" INTEGER NOT NULL DEFAULT 500,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paystackReference" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "flaggedByUserId" TEXT,
    "flagNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_invoice_vendorProfileId_idx" ON "vendor_invoice"("vendorProfileId");

-- CreateIndex
CREATE INDEX "vendor_invoice_status_idx" ON "vendor_invoice"("status");

-- CreateIndex
CREATE INDEX "vendor_invoice_dueDate_idx" ON "vendor_invoice"("dueDate");

-- AddForeignKey
ALTER TABLE "vendor_invoice" ADD CONSTRAINT "vendor_invoice_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- Remove the Ethereum wallet-linking column: verification billing now runs
-- through Paystack, not the ethAddress/on-chain flow from the "Smart
-- Contracts" branch.
ALTER TABLE "student" DROP COLUMN IF EXISTS "ethAddress";
