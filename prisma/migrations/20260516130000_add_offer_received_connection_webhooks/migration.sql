ALTER TYPE "CredentialIssuanceStatus" ADD VALUE IF NOT EXISTS 'OFFER_RECEIVED';

ALTER TYPE "CredentialEventType" ADD VALUE IF NOT EXISTS 'CONNECTION_STATE_CHANGED';

ALTER TABLE "credential_issuance"
  ADD COLUMN "outOfBandId" TEXT,
  ADD COLUMN "connectionId" TEXT;

ALTER TABLE "credential_event_log"
  ALTER COLUMN "credentialExchangeId" DROP NOT NULL,
  ADD COLUMN "outOfBandId" TEXT,
  ADD COLUMN "connectionId" TEXT;

CREATE UNIQUE INDEX "credential_issuance_outOfBandId_key"
ON "credential_issuance"("outOfBandId");

CREATE INDEX "credential_issuance_connectionId_idx"
ON "credential_issuance"("connectionId");

CREATE INDEX "credential_event_log_outOfBandId_idx"
ON "credential_event_log"("outOfBandId");

CREATE INDEX "credential_event_log_connectionId_idx"
ON "credential_event_log"("connectionId");

DROP INDEX IF EXISTS "credential_issuance_active_student_definition_key";

CREATE UNIQUE INDEX "credential_issuance_active_student_definition_key"
ON "credential_issuance"("studentId", "credentialDefinitionId")
WHERE "status" IN ('OFFER_SENT', 'OFFER_RECEIVED', 'ACCEPTED', 'ISSUED');
