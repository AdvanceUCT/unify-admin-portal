ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_INVITE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_INVITE_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_INVITE_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VENDOR_INVITE_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUB_VENDOR_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUB_VENDOR_REACTIVATED';

ALTER TABLE "vendor_profile"
  ADD COLUMN "parentVendorProfileId" TEXT,
  ADD COLUMN "locationName" TEXT,
  ADD COLUMN "locationAddress" TEXT;

CREATE INDEX "vendor_profile_parentVendorProfileId_idx" ON "vendor_profile"("parentVendorProfileId");

ALTER TABLE "vendor_profile"
  ADD CONSTRAINT "vendor_profile_parentVendorProfileId_fkey"
  FOREIGN KEY ("parentVendorProfileId")
  REFERENCES "vendor_profile"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE TABLE "vendor_invite" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "locationName" TEXT NOT NULL,
  "locationAddress" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "parentVendorProfileId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_invite_tokenHash_key" ON "vendor_invite"("tokenHash");
CREATE INDEX "vendor_invite_email_idx" ON "vendor_invite"("email");
CREATE INDEX "vendor_invite_expiresAt_idx" ON "vendor_invite"("expiresAt");
CREATE INDEX "vendor_invite_parentVendorProfileId_idx" ON "vendor_invite"("parentVendorProfileId");
CREATE INDEX "vendor_invite_createdByUserId_idx" ON "vendor_invite"("createdByUserId");
CREATE UNIQUE INDEX "vendor_invite_one_active_per_parent_email"
  ON "vendor_invite"("parentVendorProfileId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "vendor_invite"
  ADD CONSTRAINT "vendor_invite_parentVendorProfileId_fkey"
  FOREIGN KEY ("parentVendorProfileId")
  REFERENCES "vendor_profile"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
