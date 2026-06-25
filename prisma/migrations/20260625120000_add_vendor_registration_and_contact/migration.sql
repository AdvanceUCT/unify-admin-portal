ALTER TABLE "vendor_profile" ADD COLUMN IF NOT EXISTS "contactPersonName" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "companyRegistrationNumber" TEXT;
