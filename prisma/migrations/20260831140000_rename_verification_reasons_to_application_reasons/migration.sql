-- Rename vendor_application columns to match the "Reason for application" step wording
ALTER TABLE "vendor_application" RENAME COLUMN "verificationReasons" TO "applicationReasons";
ALTER TABLE "vendor_application" RENAME COLUMN "otherVerificationReason" TO "otherApplicationReason";
