CREATE TYPE "CredentialAuditAction" AS ENUM (
  'OFFER_SENT',
  'OFFER_DELIVERY_FAILED',
  'REISSUE_REQUESTED',
  'REVOCATION_REQUESTED',
  'REVOCATION_COMPLETED'
);

CREATE TABLE "credential_audit_log" (
  "id" TEXT NOT NULL,
  "action" "CredentialAuditAction" NOT NULL,
  "actorId" TEXT,
  "studentId" TEXT NOT NULL,
  "credentialDefinitionId" TEXT NOT NULL,
  "credentialExchangeId" TEXT,
  "credentialIssuanceId" TEXT,
  "batchId" TEXT,
  "batchItemId" TEXT,
  "email" TEXT,
  "deliveryStatus" "CredentialDeliveryStatus",
  "message" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credential_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credential_audit_log_action_credentialExchangeId_key"
ON "credential_audit_log"("action", "credentialExchangeId");

CREATE INDEX "credential_audit_log_actorId_idx" ON "credential_audit_log"("actorId");
CREATE INDEX "credential_audit_log_studentId_idx" ON "credential_audit_log"("studentId");
CREATE INDEX "credential_audit_log_credentialDefinitionId_idx" ON "credential_audit_log"("credentialDefinitionId");
CREATE INDEX "credential_audit_log_credentialExchangeId_idx" ON "credential_audit_log"("credentialExchangeId");
CREATE INDEX "credential_audit_log_credentialIssuanceId_idx" ON "credential_audit_log"("credentialIssuanceId");
CREATE INDEX "credential_audit_log_action_idx" ON "credential_audit_log"("action");
CREATE INDEX "credential_audit_log_occurredAt_idx" ON "credential_audit_log"("occurredAt");
