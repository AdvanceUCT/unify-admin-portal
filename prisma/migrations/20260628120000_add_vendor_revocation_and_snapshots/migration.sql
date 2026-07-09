-- Add REVOKED status to keep revocations distinct from denials
ALTER TYPE "VendorApplicationStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

-- Add audit action for revocation events
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_APPLICATION_REVOKED';

-- Revocation fields — separate from the original review fields so approval history is preserved
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "revokedByUserId" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "revokedNotes" TEXT;

-- Immutable snapshots of vendor profile data at time of application submission
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "snapshotCompanyName" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "snapshotServiceCategory" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "snapshotContactEmail" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "snapshotContactPersonName" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "snapshotWebsite" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN IF NOT EXISTS "snapshotDescription" TEXT;
