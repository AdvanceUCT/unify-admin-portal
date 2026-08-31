/*
  Warnings:

  - The values [VENDOR_INVITE_CREATED,VENDOR_INVITE_ACCEPTED,VENDOR_INVITE_REVOKED,VENDOR_INVITE_EXPIRED,SUB_VENDOR_DEACTIVATED,SUB_VENDOR_REACTIVATED] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `locationAddress` on the `vendor_profile` table. All the data in the column will be lost.
  - You are about to drop the column `locationName` on the `vendor_profile` table. All the data in the column will be lost.
  - You are about to drop the column `parentVendorProfileId` on the `vendor_profile` table. All the data in the column will be lost.
  - You are about to drop the `vendor_invite` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[vendorProfileId]` on the table `vendor_application` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'INVITE_CREATED', 'INVITE_ACCEPTED', 'INVITE_REVOKED', 'INVITE_EXPIRED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'USER_ROLE_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'SESSION_REVOKED', 'BATCH_ISSUANCE_CREATED', 'BATCH_ISSUANCE_COMPLETED', 'BATCH_ISSUANCE_RETRIED', 'VENDOR_SIGNUP', 'VENDOR_APPLICATION_SUBMITTED', 'VENDOR_APPLICATION_APPROVED', 'VENDOR_APPLICATION_REJECTED', 'VENDOR_APPLICATION_REVOKED', 'SETTINGS_UPDATED', 'VENDOR_PROFILE_UPDATED', 'VENDOR_BRANCH_CREATED', 'VENDOR_BRANCH_UPDATED', 'VENDOR_BRANCH_STATUS_CHANGED', 'VENDOR_DEFAULT_BRANCH_CHANGED', 'VENDOR_STAFF_INVITE_CREATED', 'VENDOR_STAFF_INVITE_ACCEPTED', 'VENDOR_STAFF_INVITE_REVOKED', 'VENDOR_STAFF_BRANCH_ACCESS_UPDATED', 'VENDOR_STAFF_STATUS_CHANGED', 'STUDENT_IMPORT_COMMITTED', 'SCHEMA_VERSION_CREATED', 'SCHEMA_PUBLISHED', 'SCHEMA_VERSION_DELETED', 'RENEWAL_SETTINGS_UPDATED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "vendor_invite" DROP CONSTRAINT "vendor_invite_parentVendorProfileId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_profile" DROP CONSTRAINT "vendor_profile_parentVendorProfileId_fkey";

-- DropIndex
DROP INDEX "credential_issuance_active_student_definition_key";

-- DropIndex
DROP INDEX "credential_schema_one_active_per_university_key";

-- DropIndex
DROP INDEX "vendor_application_one_active_per_profile";

-- DropIndex
DROP INDEX "vendor_profile_parentVendorProfileId_idx";

-- AlterTable
ALTER TABLE "vendor_application" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "operatesInMultipleCountries" BOOLEAN DEFAULT false,
ADD COLUMN     "operatingCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "yearOfIncorporation" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "vendor_profile" DROP COLUMN "locationAddress",
DROP COLUMN "locationName",
DROP COLUMN "parentVendorProfileId";

-- DropTable
DROP TABLE "vendor_invite";

-- CreateIndex
CREATE UNIQUE INDEX "vendor_application_one_active_per_profile" ON "vendor_application"("vendorProfileId") WHERE ("status" IN ('DRAFT', 'PENDING', 'APPROVED'));

-- RenameIndex
ALTER INDEX "credential_issuance_revocationRegistryDefinitionId_credentialRe" RENAME TO "credential_issuance_revocationRegistryDefinitionId_credenti_key";

-- RenameIndex
ALTER INDEX "credential_schema_universityProfileId_schemaName_schemaVersion_" RENAME TO "credential_schema_universityProfileId_schemaName_schemaVers_key";
