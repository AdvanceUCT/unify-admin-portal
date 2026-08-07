-- AlterTable
ALTER TABLE "vendor_application" ADD COLUMN     "verificationReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "otherVerificationReason" TEXT;
