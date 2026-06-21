-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_SIGNUP';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_APPLICATION_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_APPLICATION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_APPLICATION_REJECTED';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "userType" TEXT NOT NULL DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE "vendor_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "serviceCategory" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_application" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "justification" TEXT NOT NULL,
    "requestedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profile_userId_key" ON "vendor_profile"("userId");

-- CreateIndex
CREATE INDEX "vendor_application_vendorProfileId_idx" ON "vendor_application"("vendorProfileId");

-- CreateIndex
CREATE INDEX "vendor_application_status_idx" ON "vendor_application"("status");

-- AddForeignKey
ALTER TABLE "vendor_profile" ADD CONSTRAINT "vendor_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application" ADD CONSTRAINT "vendor_application_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
