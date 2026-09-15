-- Rework branch payment-access applications and remove campus classification.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_BRANCH_PAYMENT_ACCESS_REVOKED';

ALTER TABLE "vendor_branch_payment_application"
  ADD COLUMN "studentDataAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "studentDataAcknowledgementText" TEXT,
  ADD COLUMN "payoutProviderSnapshot" TEXT,
  ADD COLUMN "payoutDestinationReferenceSnapshot" TEXT,
  ADD COLUMN "payoutDestinationSnapshot" JSONB,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT,
  ADD COLUMN "revokedNotes" TEXT;

ALTER TABLE "vendor_branch"
  DROP COLUMN IF EXISTS "campusStatus";

DROP TYPE IF EXISTS "CampusStatus";
