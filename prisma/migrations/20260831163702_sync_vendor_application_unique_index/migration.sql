/*
  Warnings:

  - A unique constraint covering the columns `[vendorProfileId]` on the table `vendor_application` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "vendor_application_one_active_per_profile";

-- CreateIndex
CREATE UNIQUE INDEX "vendor_application_one_active_per_profile" ON "vendor_application"("vendorProfileId") WHERE ("status" IN ('DRAFT', 'PENDING', 'APPROVED'));
