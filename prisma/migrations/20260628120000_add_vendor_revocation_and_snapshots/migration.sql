-- Add REVOKED status to keep revocations distinct from denials
ALTER TYPE "VendorApplicationStatus" ADD VALUE 'REVOKED';

-- Add audit action for revocation events
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_APPLICATION_REVOKED';

-- Revocation fields — separate from the original review fields so approval history is preserved
ALTER TABLE "vendor_application" ADD COLUMN "revokedByUserId" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "vendor_application" ADD COLUMN "revokedNotes" TEXT;

-- Immutable snapshots of vendor profile data at time of application submission
ALTER TABLE "vendor_application" ADD COLUMN "snapshotCompanyName" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN "snapshotServiceCategory" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN "snapshotContactEmail" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN "snapshotContactPersonName" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN "snapshotWebsite" TEXT;
ALTER TABLE "vendor_application" ADD COLUMN "snapshotDescription" TEXT;
