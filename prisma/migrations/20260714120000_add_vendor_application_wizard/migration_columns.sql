-- Step B: Schema changes (run after enum commit)

-- Make justification nullable (DRAFT applications haven't reached Step 3 yet)
ALTER TABLE "vendor_application" ALTER COLUMN "justification" DROP NOT NULL;

-- Step 1 — Organisation Information
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "tradingName" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "organisationType" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "physicalAddress" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "postalAddress" TEXT;

-- Step 2 — Authorised Representative
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "contactJobTitle" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "contactEmployeeNumber" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "preferredContactMethod" TEXT;

-- Step 3 — Verification Requirements
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "additionalInfo" TEXT;

-- Step 4 — Supporting Documents (Supabase Storage paths)
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "docRegistrationCertificate" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "docProofOfAddress" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "docRepresentativeId" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "docLetterOfAuthorisation" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "docTaxCompliance" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "docBusinessLicence" TEXT;

-- Step 5 — Declaration
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "declarationAccepted" BOOLEAN;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "declarationAcceptedAt" TIMESTAMP(3);

-- Extend partial unique index to include DRAFT (one active application per vendor)
DROP INDEX IF EXISTS "vendor_application_one_active_per_profile";
CREATE UNIQUE INDEX "vendor_application_one_active_per_profile"
  ON "vendor_application" ("vendorProfileId")
  WHERE "status" IN ('DRAFT', 'PENDING', 'APPROVED');
