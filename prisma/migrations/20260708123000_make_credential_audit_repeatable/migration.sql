DROP INDEX IF EXISTS "credential_audit_log_action_credentialExchangeId_key";

ALTER TABLE "credential_audit_log"
ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "credential_audit_log_eventId_key"
ON "credential_audit_log"("eventId");

CREATE INDEX "credential_audit_log_action_credentialExchangeId_idx"
ON "credential_audit_log"("action", "credentialExchangeId");
