-- CreateEnum
CREATE TYPE "VendorVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "vendor_verification" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "verificationRequestId" TEXT,
    "servicePointId" TEXT,
    "servicePointName" TEXT,
    "status" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN,
    "failureCode" TEXT,
    "attributes" JSONB,
    "schemaId" TEXT,
    "credentialDefinitionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "vendor_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_verification_verificationRequestId_key" ON "vendor_verification"("verificationRequestId");

-- CreateIndex
CREATE INDEX "vendor_verification_vendorProfileId_idx" ON "vendor_verification"("vendorProfileId");

-- CreateIndex
CREATE INDEX "vendor_verification_status_idx" ON "vendor_verification"("status");

-- CreateIndex
CREATE INDEX "vendor_verification_createdAt_idx" ON "vendor_verification"("createdAt");

-- AddForeignKey
ALTER TABLE "vendor_verification" ADD CONSTRAINT "vendor_verification_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
