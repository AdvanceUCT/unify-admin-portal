-- CreateEnum
CREATE TYPE "CredentialSchemaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- AlterTable: add nullable status first so we can backfill from isActive
ALTER TABLE "credential_schema" ADD COLUMN "status" "CredentialSchemaStatus";
ALTER TABLE "credential_schema" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Backfill: existing active row -> ACTIVE (publishedAt approximated from updatedAt),
-- everything else -> RETIRED
UPDATE "credential_schema" SET "status" = 'ACTIVE', "publishedAt" = "updatedAt" WHERE "isActive" = true;
UPDATE "credential_schema" SET "status" = 'RETIRED' WHERE "isActive" = false;

ALTER TABLE "credential_schema" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "credential_schema" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "credential_schema" DROP COLUMN "isActive";

-- CreateIndex
CREATE INDEX "credential_schema_universityProfileId_status_idx" ON "credential_schema"("universityProfileId", "status");

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SCHEMA_PUBLISHED';
