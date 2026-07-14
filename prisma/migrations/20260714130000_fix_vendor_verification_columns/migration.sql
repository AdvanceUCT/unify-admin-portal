-- Adds columns that were missing from the vendor_verification table.
-- The original migration (20260630120000_add_vendor_verifications) declared these
-- in CREATE TABLE, but they were absent in some environments. Safe to re-run.
ALTER TABLE "vendor_verification" ADD COLUMN IF NOT EXISTS "attributes" JSONB;
ALTER TABLE "vendor_verification" ADD COLUMN IF NOT EXISTS "schemaId" TEXT;
ALTER TABLE "vendor_verification" ADD COLUMN IF NOT EXISTS "credentialDefinitionId" TEXT;
