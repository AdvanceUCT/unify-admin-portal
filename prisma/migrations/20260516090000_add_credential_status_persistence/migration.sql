-- CreateEnum
CREATE TYPE "CredentialIssuanceStatus" AS ENUM ('OFFER_SENT', 'ACCEPTED', 'ISSUED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "CredentialEventType" AS ENUM ('CREDENTIAL_STATE_CHANGED');

-- CreateTable
CREATE TABLE "credential_issuance" (
    "id" TEXT NOT NULL,
    "studentExternalId" TEXT NOT NULL,
    "credentialDefinitionId" TEXT NOT NULL,
    "credentialExchangeId" TEXT,
    "activationId" TEXT,
    "activationUrl" TEXT,
    "activationExpiresAt" TIMESTAMP(3),
    "email" TEXT,
    "deliveryStatus" "CredentialDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "status" "CredentialIssuanceStatus" NOT NULL,
    "failureReason" TEXT,
    "batchItemId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_issuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_event_log" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "CredentialEventType" NOT NULL,
    "credentialExchangeId" TEXT NOT NULL,
    "credentialDefinitionId" TEXT,
    "previousState" TEXT,
    "state" TEXT NOT NULL,
    "status" "CredentialIssuanceStatus",
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_issuance_credentialExchangeId_key" ON "credential_issuance"("credentialExchangeId");

-- CreateIndex
CREATE INDEX "credential_issuance_studentExternalId_idx" ON "credential_issuance"("studentExternalId");

-- CreateIndex
CREATE INDEX "credential_issuance_credentialDefinitionId_idx" ON "credential_issuance"("credentialDefinitionId");

-- CreateIndex
CREATE INDEX "credential_issuance_status_idx" ON "credential_issuance"("status");

-- CreateIndex
CREATE INDEX "credential_issuance_batchItemId_idx" ON "credential_issuance"("batchItemId");

-- CreateIndex
CREATE INDEX "credential_issuance_createdAt_idx" ON "credential_issuance"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "credential_issuance_active_student_definition_key"
ON "credential_issuance"("studentExternalId", "credentialDefinitionId")
WHERE "status" IN ('OFFER_SENT', 'ACCEPTED', 'ISSUED');

-- CreateIndex
CREATE UNIQUE INDEX "credential_event_log_eventId_key" ON "credential_event_log"("eventId");

-- CreateIndex
CREATE INDEX "credential_event_log_credentialExchangeId_idx" ON "credential_event_log"("credentialExchangeId");

-- CreateIndex
CREATE INDEX "credential_event_log_credentialDefinitionId_idx" ON "credential_event_log"("credentialDefinitionId");

-- CreateIndex
CREATE INDEX "credential_event_log_status_idx" ON "credential_event_log"("status");

-- CreateIndex
CREATE INDEX "credential_event_log_occurredAt_idx" ON "credential_event_log"("occurredAt");
