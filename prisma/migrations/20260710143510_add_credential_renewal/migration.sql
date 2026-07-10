-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'RENEWAL_CADENCE_UPDATED';

-- AlterEnum
ALTER TYPE "CredentialIssuanceStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "credential_issuance" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "renewedFromIssuanceId" TEXT;

-- AlterTable
ALTER TABLE "university_profile" ADD COLUMN     "renewalCadenceMonths" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "credential_issuance_renewedFromIssuanceId_key" ON "credential_issuance"("renewedFromIssuanceId");

-- CreateIndex
CREATE INDEX "credential_issuance_status_expiresAt_idx" ON "credential_issuance"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "credential_issuance" ADD CONSTRAINT "credential_issuance_renewedFromIssuanceId_fkey" FOREIGN KEY ("renewedFromIssuanceId") REFERENCES "credential_issuance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
