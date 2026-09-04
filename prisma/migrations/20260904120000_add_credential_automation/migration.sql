CREATE TYPE "CredentialAutomationJobType" AS ENUM ('AUTO_RENEW', 'AUTO_REACTIVATE', 'REVOKE_REPLACED');
CREATE TYPE "CredentialAutomationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

ALTER TABLE "university_profile"
ADD COLUMN "automaticCredentialRenewalEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "credential_automation_job" (
  "id" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "type" "CredentialAutomationJobType" NOT NULL,
  "status" "CredentialAutomationJobStatus" NOT NULL DEFAULT 'PENDING',
  "credentialIssuanceId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "processingStartedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "requestedByActorId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credential_automation_job_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credential_automation_job_credentialIssuanceId_fkey"
    FOREIGN KEY ("credentialIssuanceId") REFERENCES "credential_issuance"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "credential_automation_job_deduplicationKey_key"
ON "credential_automation_job"("deduplicationKey");
CREATE INDEX "credential_automation_job_status_dueAt_idx"
ON "credential_automation_job"("status", "dueAt");
CREATE INDEX "credential_automation_job_credentialIssuanceId_type_createdAt_idx"
ON "credential_automation_job"("credentialIssuanceId", "type", "createdAt");

CREATE INDEX "credential_issuance_status_lifecycleStatus_issuedAt_idx"
ON "credential_issuance"("status", "lifecycleStatus", "issuedAt");

ALTER TABLE "credential_automation_job" ENABLE ROW LEVEL SECURITY;

ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_REACTIVATION_SCHEDULED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_AUTOMATION_RETRY_SCHEDULED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_AUTOMATION_CANCELLED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_AUTOMATION_FAILED';
