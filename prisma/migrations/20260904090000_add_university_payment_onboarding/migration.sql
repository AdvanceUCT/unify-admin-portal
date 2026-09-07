-- Payment onboarding: vendor-university partnerships, payment-acceptance
-- review, and university-level Paystack settings.

CREATE TYPE "CampusStatus" AS ENUM ('ON_CAMPUS', 'OFF_CAMPUS');
CREATE TYPE "PayoutCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_SERVICES_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYSTACK_KEY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_CAMPUS_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_PAYMENT_APPLICATION_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_PAYMENT_APPLICATION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_PAYMENT_APPLICATION_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_PAYMENT_APPLICATION_REVOKED';

ALTER TABLE "university_profile"
  ADD COLUMN "paymentServicesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentServicesEnabledAt" TIMESTAMP(3);

CREATE TABLE "vendor_university_partnership" (
  "id" TEXT NOT NULL,
  "vendorProfileId" TEXT NOT NULL,
  "universityProfileId" TEXT NOT NULL,
  "campusStatus" "CampusStatus",
  "paymentAcceptanceStatus" "VendorApplicationStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_university_partnership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_university_partnership_vendorProfileId_universityPro_key"
  ON "vendor_university_partnership"("vendorProfileId", "universityProfileId");
CREATE INDEX "vendor_university_partnership_universityProfileId_idx"
  ON "vendor_university_partnership"("universityProfileId");

ALTER TABLE "vendor_university_partnership"
  ADD CONSTRAINT "vendor_university_partnership_vendorProfileId_fkey"
  FOREIGN KEY ("vendorProfileId")
  REFERENCES "vendor_profile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "vendor_university_partnership"
  ADD CONSTRAINT "vendor_university_partnership_universityProfileId_fkey"
  FOREIGN KEY ("universityProfileId")
  REFERENCES "university_profile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE TABLE "vendor_payment_application" (
  "id" TEXT NOT NULL,
  "partnershipId" TEXT NOT NULL,
  "status" "VendorApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "justification" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "revokedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_payment_application_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_payment_application_partnershipId_idx"
  ON "vendor_payment_application"("partnershipId");
CREATE INDEX "vendor_payment_application_status_idx"
  ON "vendor_payment_application"("status");
CREATE UNIQUE INDEX "vendor_payment_application_one_active_per_partnership"
  ON "vendor_payment_application"("partnershipId")
  WHERE "status" IN ('DRAFT', 'PENDING', 'APPROVED');

ALTER TABLE "vendor_payment_application"
  ADD CONSTRAINT "vendor_payment_application_partnershipId_fkey"
  FOREIGN KEY ("partnershipId")
  REFERENCES "vendor_university_partnership"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE TABLE "university_payment_settings" (
  "id" TEXT NOT NULL,
  "universityProfileId" TEXT NOT NULL,
  "financeContactName" TEXT,
  "financeContactEmail" TEXT,
  "technicalContactName" TEXT,
  "technicalContactEmail" TEXT,
  "payoutCadence" "PayoutCadence" NOT NULL DEFAULT 'WEEKLY',
  "paystackTestKeyCiphertext" TEXT,
  "paystackTestKeyValidatedAt" TIMESTAMP(3),
  "paystackLiveKeyCiphertext" TEXT,
  "paystackLiveKeyValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "university_payment_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "university_payment_settings_universityProfileId_key"
  ON "university_payment_settings"("universityProfileId");

ALTER TABLE "university_payment_settings"
  ADD CONSTRAINT "university_payment_settings_universityProfileId_fkey"
  FOREIGN KEY ("universityProfileId")
  REFERENCES "university_profile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Backfill: one partnership row per existing vendor, linked to the single
-- university row in this deployment (see the tenancy note on
-- VendorUniversityPartnership in schema.prisma — this deployment only ever
-- has one UniversityProfile row). campusStatus and paymentAcceptanceStatus
-- start NULL pending admin classification.
INSERT INTO "vendor_university_partnership" ("id", "vendorProfileId", "universityProfileId", "updatedAt")
SELECT
  'vup_' || substr(md5(vendor_profile."id" || university_profile."id"), 1, 20),
  vendor_profile."id",
  university_profile."id",
  CURRENT_TIMESTAMP
FROM "vendor_profile" AS vendor_profile
CROSS JOIN LATERAL (
  SELECT "id" FROM "university_profile" ORDER BY "createdAt" ASC LIMIT 1
) AS university_profile
ON CONFLICT ("vendorProfileId", "universityProfileId") DO NOTHING;
