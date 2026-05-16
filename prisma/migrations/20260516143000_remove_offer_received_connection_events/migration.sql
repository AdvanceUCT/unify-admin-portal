-- Connection events are no longer part of the portal credential status model.
-- Keep credential issuance canonical and remove previously stored connection
-- activity from the dashboard/event log.

UPDATE "credential_issuance"
SET "status" = 'OFFER_SENT'
WHERE "status" = 'OFFER_RECEIVED';

UPDATE "credential_event_log"
SET "status" = 'OFFER_SENT'
WHERE "status" = 'OFFER_RECEIVED';

DELETE FROM "credential_event_log"
WHERE "type" = 'CONNECTION_STATE_CHANGED';

DROP INDEX IF EXISTS "credential_issuance_outOfBandId_key";
DROP INDEX IF EXISTS "credential_issuance_connectionId_idx";
DROP INDEX IF EXISTS "credential_event_log_outOfBandId_idx";
DROP INDEX IF EXISTS "credential_event_log_connectionId_idx";
DROP INDEX IF EXISTS "credential_issuance_active_student_definition_key";

ALTER TABLE "credential_issuance"
  DROP COLUMN IF EXISTS "outOfBandId",
  DROP COLUMN IF EXISTS "connectionId";

ALTER TABLE "credential_event_log"
  DROP COLUMN IF EXISTS "outOfBandId",
  DROP COLUMN IF EXISTS "connectionId";

ALTER TABLE "credential_event_log"
  ALTER COLUMN "credentialExchangeId" SET NOT NULL;

ALTER TYPE "CredentialIssuanceStatus" RENAME TO "CredentialIssuanceStatus_old";
CREATE TYPE "CredentialIssuanceStatus" AS ENUM ('OFFER_SENT', 'ACCEPTED', 'ISSUED', 'FAILED', 'REVOKED');

ALTER TABLE "credential_issuance"
  ALTER COLUMN "status" TYPE "CredentialIssuanceStatus"
  USING "status"::text::"CredentialIssuanceStatus";

ALTER TABLE "credential_event_log"
  ALTER COLUMN "status" TYPE "CredentialIssuanceStatus"
  USING "status"::text::"CredentialIssuanceStatus";

DROP TYPE "CredentialIssuanceStatus_old";

ALTER TYPE "CredentialEventType" RENAME TO "CredentialEventType_old";
CREATE TYPE "CredentialEventType" AS ENUM ('CREDENTIAL_STATE_CHANGED');

ALTER TABLE "credential_event_log"
  ALTER COLUMN "type" TYPE "CredentialEventType"
  USING "type"::text::"CredentialEventType";

DROP TYPE "CredentialEventType_old";

CREATE UNIQUE INDEX "credential_issuance_active_student_definition_key"
ON "credential_issuance"("studentId", "credentialDefinitionId")
WHERE "status" IN ('OFFER_SENT', 'ACCEPTED', 'ISSUED');
