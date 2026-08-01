-- CreateEnum
CREATE TYPE "CredentialSchemaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CredentialRenewalStatus" AS ENUM ('NONE', 'PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "university_profile"
ADD COLUMN "defaultCredentialValidityDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN "renewalCadenceMonths" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "credential_schema"
ADD COLUMN "status" "CredentialSchemaStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "credential_schema"
SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"CredentialSchemaStatus" ELSE 'RETIRED'::"CredentialSchemaStatus" END,
    "publishedAt" = COALESCE("activatedAt", "createdAt")
WHERE "status" = 'ACTIVE'::"CredentialSchemaStatus";

-- AlterTable
ALTER TABLE "credential_issuance"
ADD COLUMN "renewalStatus" "CredentialRenewalStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "renewalRequestedAt" TIMESTAMP(3),
ADD COLUMN "renewalCompletedAt" TIMESTAMP(3),
ADD COLUMN "renewalFailureReason" TEXT,
ADD COLUMN "renewedFromIssuanceId" TEXT,
ADD COLUMN "renewedIntoIssuanceId" TEXT;

-- AlterEnum-equivalent inserts for string enums represented by Prisma.
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_RENEWAL_OFFER_CREATED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_RENEWAL_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEMA_VERSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEMA_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RENEWAL_SETTINGS_UPDATED';

-- CreateIndex
CREATE INDEX "credential_schema_universityProfileId_status_idx" ON "credential_schema"("universityProfileId", "status");

-- CreateIndex
CREATE INDEX "credential_issuance_renewalStatus_idx" ON "credential_issuance"("renewalStatus");

-- CreateIndex
CREATE INDEX "credential_issuance_renewedFromIssuanceId_idx" ON "credential_issuance"("renewedFromIssuanceId");

-- CreateIndex
CREATE INDEX "credential_issuance_renewedIntoIssuanceId_idx" ON "credential_issuance"("renewedIntoIssuanceId");
