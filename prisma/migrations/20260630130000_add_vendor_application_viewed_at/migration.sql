ALTER TABLE "vendor_application"
ADD COLUMN IF NOT EXISTS "viewedByAdminAt" TIMESTAMP(3);
