CREATE TYPE "CredentialLifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');

ALTER TABLE "credential_issuance"
ADD COLUMN "revocationRegistryDefinitionId" TEXT,
ADD COLUMN "credentialRevocationId" TEXT,
ADD COLUMN "lifecycleStatus" "CredentialLifecycleStatus",
ADD COLUMN "lifecycleStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "lifecycleReason" TEXT,
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "reactivatedAt" TIMESTAMP(3),
ADD COLUMN "credentialExpiresAt" TIMESTAMP(3);

ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_LIFECYCLE_ACTIVATED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_SUSPENDED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_REACTIVATED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_REVOKED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_EXPIRED';
ALTER TYPE "CredentialAuditAction" ADD VALUE IF NOT EXISTS 'CREDENTIAL_RENEWAL_REQUESTED';

CREATE INDEX "credential_issuance_revocationRegistryDefinitionId_idx" ON "credential_issuance"("revocationRegistryDefinitionId");
CREATE INDEX "credential_issuance_lifecycleStatus_idx" ON "credential_issuance"("lifecycleStatus");
CREATE UNIQUE INDEX "credential_issuance_revocationRegistryDefinitionId_credentialRevocationId_key"
ON "credential_issuance"("revocationRegistryDefinitionId", "credentialRevocationId");
