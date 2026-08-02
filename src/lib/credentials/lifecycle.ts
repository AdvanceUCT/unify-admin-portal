import { CredentialIssuanceStatus, CredentialLifecycleStatus } from "@/generated/prisma/enums";
import type { CredentialLifecycleState } from "@/lib/api/types";

export type CredentialLifecycleSource = {
  credentialExpiresAt?: Date | null;
  credentialRevocationId?: string | null;
  lifecycleStatus?: CredentialLifecycleStatus | null;
  revocationRegistryDefinitionId?: string | null;
  status: CredentialIssuanceStatus;
};

function hasRevocationHandle(issuance: Pick<CredentialLifecycleSource, "credentialRevocationId" | "revocationRegistryDefinitionId">) {
  return Boolean(issuance.revocationRegistryDefinitionId && issuance.credentialRevocationId);
}

function lifecycleStatusToPublic(status: CredentialLifecycleStatus): CredentialLifecycleState {
  if (status === CredentialLifecycleStatus.ACTIVE) return "ACTIVE";
  if (status === CredentialLifecycleStatus.SUSPENDED) return "SUSPENDED";
  if (status === CredentialLifecycleStatus.EXPIRED) return "EXPIRED";
  return "REVOKED";
}

export function toPublicCredentialStatus(issuance?: CredentialLifecycleSource | null, now = new Date()): CredentialLifecycleState {
  if (!issuance) return "NOT_ISSUED";
  if (issuance.status === CredentialIssuanceStatus.OFFER_SENT) return "OFFER_SENT";
  if (issuance.status === CredentialIssuanceStatus.ACCEPTED) return "ACCEPTED";
  if (issuance.status === CredentialIssuanceStatus.FAILED) return "FAILED";
  if (issuance.status === CredentialIssuanceStatus.REVOKED) return "REVOKED";
  if (
    issuance.lifecycleStatus === CredentialLifecycleStatus.REVOKED ||
    issuance.lifecycleStatus === CredentialLifecycleStatus.SUSPENDED
  ) {
    return lifecycleStatusToPublic(issuance.lifecycleStatus);
  }
  if (issuance.credentialExpiresAt && issuance.credentialExpiresAt <= now) return "EXPIRED";
  if (issuance.lifecycleStatus) return lifecycleStatusToPublic(issuance.lifecycleStatus);
  if (hasRevocationHandle(issuance)) return "ACTIVE";
  return "LEGACY_NON_REVOCABLE";
}
