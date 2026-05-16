-- Standardise the canonical student reference name.
ALTER TABLE "credential_issuance" RENAME COLUMN "studentExternalId" TO "studentId";

-- Replace the one-way batchItemId reference on credential_issuance with an
-- optional credentialIssuanceId reference on batch_issuance_item.
ALTER TABLE "batch_issuance_item" ADD COLUMN "credentialIssuanceId" TEXT;

UPDATE "batch_issuance_item" item
SET "credentialIssuanceId" = issuance."id"
FROM "credential_issuance" issuance
WHERE issuance."batchItemId" = item."id";

-- Remove indexes that reference old names / redundant columns.
DROP INDEX IF EXISTS "credential_issuance_studentExternalId_idx";
DROP INDEX IF EXISTS "credential_issuance_batchItemId_idx";
DROP INDEX IF EXISTS "credential_issuance_active_student_definition_key";
DROP INDEX IF EXISTS "batch_issuance_item_credentialId_idx";

-- Drop duplicated credential/delivery/profile snapshot columns from batch
-- items. Canonical credential details now live in credential_issuance, while
-- student profile details are read from the external student source.
ALTER TABLE "batch_issuance_item"
  DROP COLUMN IF EXISTS "credentialId",
  DROP COLUMN IF EXISTS "holderName",
  DROP COLUMN IF EXISTS "email",
  DROP COLUMN IF EXISTS "faculty",
  DROP COLUMN IF EXISTS "programme",
  DROP COLUMN IF EXISTS "activationId",
  DROP COLUMN IF EXISTS "activationUrl",
  DROP COLUMN IF EXISTS "credentialExchangeId",
  DROP COLUMN IF EXISTS "deliveredAt",
  DROP COLUMN IF EXISTS "activatedAt",
  DROP COLUMN IF EXISTS "expiresAt";

ALTER TABLE "credential_issuance" DROP COLUMN IF EXISTS "batchItemId";

-- Recreate indexes and constraints for the new shape.
CREATE INDEX "credential_issuance_studentId_idx" ON "credential_issuance"("studentId");

CREATE UNIQUE INDEX "credential_issuance_active_student_definition_key"
ON "credential_issuance"("studentId", "credentialDefinitionId")
WHERE "status" IN ('OFFER_SENT', 'ACCEPTED', 'ISSUED');

CREATE UNIQUE INDEX "batch_issuance_item_credentialIssuanceId_key"
ON "batch_issuance_item"("credentialIssuanceId");

ALTER TABLE "batch_issuance_item"
ADD CONSTRAINT "batch_issuance_item_credentialIssuanceId_fkey"
FOREIGN KEY ("credentialIssuanceId") REFERENCES "credential_issuance"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
