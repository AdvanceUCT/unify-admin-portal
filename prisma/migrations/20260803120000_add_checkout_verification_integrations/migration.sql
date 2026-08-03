ALTER TABLE "vendor_profile"
ADD COLUMN "agentServicePointId" TEXT;

ALTER TABLE "vendor_verification"
ADD COLUMN "checkoutId" TEXT,
ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "vendor_verification_eventId_key"
ON "vendor_verification"("eventId");

CREATE UNIQUE INDEX "vendor_verification_vendorProfileId_checkoutId_key"
ON "vendor_verification"("vendorProfileId", "checkoutId");

CREATE TABLE "vendor_api_credential" (
  "id" TEXT NOT NULL,
  "vendorProfileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_api_credential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_api_credential_keyPrefix_key" ON "vendor_api_credential"("keyPrefix");
CREATE UNIQUE INDEX "vendor_api_credential_keyHash_key" ON "vendor_api_credential"("keyHash");
CREATE INDEX "vendor_api_credential_vendorProfileId_idx" ON "vendor_api_credential"("vendorProfileId");

CREATE TABLE "vendor_webhook_config" (
  "id" TEXT NOT NULL,
  "vendorProfileId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "signingSecretCiphertext" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_webhook_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_webhook_config_vendorProfileId_key" ON "vendor_webhook_config"("vendorProfileId");

CREATE TYPE "VendorWebhookDeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

CREATE TABLE "vendor_webhook_delivery" (
  "id" TEXT NOT NULL,
  "vendorVerificationId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "VendorWebhookDeliveryStatus" NOT NULL,
  "responseStatus" INTEGER,
  "errorMessage" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_webhook_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_webhook_delivery_vendorVerificationId_attemptNumber_key"
ON "vendor_webhook_delivery"("vendorVerificationId", "attemptNumber");
CREATE INDEX "vendor_webhook_delivery_status_idx" ON "vendor_webhook_delivery"("status");

ALTER TABLE "vendor_api_credential"
ADD CONSTRAINT "vendor_api_credential_vendorProfileId_fkey"
FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_webhook_config"
ADD CONSTRAINT "vendor_webhook_config_vendorProfileId_fkey"
FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_webhook_delivery"
ADD CONSTRAINT "vendor_webhook_delivery_vendorVerificationId_fkey"
FOREIGN KEY ("vendorVerificationId") REFERENCES "vendor_verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
