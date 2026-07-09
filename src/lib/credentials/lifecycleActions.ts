import "server-only";

import { CredentialAuditAction, CredentialIssuanceStatus, CredentialLifecycleStatus } from "@/generated/prisma/enums";
import { changeCredentialLifecycle, type AgentCredentialLifecycleResult } from "@/lib/agentClient";
import type { CredentialLifecycleChangedWebhookPayload } from "@/lib/credentials/statusMapping";
import { toPublicCredentialStatus } from "@/lib/credentials/lifecycle";
import { prisma } from "@/lib/db/prisma";

export type CredentialLifecycleAction = "reactivate" | "revoke" | "suspend";

export class CredentialLifecycleActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CredentialLifecycleActionError";
  }
}

type PersistedLifecycleChange = {
  actorId?: string | null;
  credentialExchangeId: string;
  credentialRevocationId: string;
  eventId: string;
  previousStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
  reason?: string;
  revocationRegistryDefinitionId: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  statusListTimestamp?: number;
  timestamp: string;
};

function auditActionFor(status: PersistedLifecycleChange["status"]) {
  if (status === "SUSPENDED") return CredentialAuditAction.CREDENTIAL_SUSPENDED;
  if (status === "REVOKED") return CredentialAuditAction.CREDENTIAL_REVOKED;
  return CredentialAuditAction.CREDENTIAL_REACTIVATED;
}

function lifecycleStatusFor(status: PersistedLifecycleChange["status"]) {
  if (status === "SUSPENDED") return CredentialLifecycleStatus.SUSPENDED;
  if (status === "REVOKED") return CredentialLifecycleStatus.REVOKED;
  return CredentialLifecycleStatus.ACTIVE;
}

function messageFor(status: PersistedLifecycleChange["status"]) {
  if (status === "SUSPENDED") return "Credential temporarily suspended.";
  if (status === "REVOKED") return "Credential permanently revoked.";
  return "Credential reactivated.";
}

async function persistLifecycleChange(change: PersistedLifecycleChange) {
  const issuance = await prisma.credentialIssuance.findUnique({
    where: { credentialExchangeId: change.credentialExchangeId },
  });
  if (!issuance) {
    throw new CredentialLifecycleActionError("Credential issuance was not found in the Admin Portal.", 404);
  }
  if (
    (issuance.credentialRevocationId && issuance.credentialRevocationId !== change.credentialRevocationId) ||
    (issuance.revocationRegistryDefinitionId &&
      issuance.revocationRegistryDefinitionId !== change.revocationRegistryDefinitionId)
  ) {
    throw new CredentialLifecycleActionError("Agent revocation metadata does not match the stored issuance.", 409);
  }

  const occurredAt = new Date(change.timestamp);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new CredentialLifecycleActionError("Agent returned an invalid lifecycle timestamp.", 502);
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.credentialIssuance.update({
      data: {
        credentialRevocationId: change.credentialRevocationId,
        lifecycleReason: change.reason ?? null,
        lifecycleStatus: lifecycleStatusFor(change.status),
        lifecycleStatusUpdatedAt: occurredAt,
        reactivatedAt: change.status === "ACTIVE" ? occurredAt : issuance.reactivatedAt,
        revocationRegistryDefinitionId: change.revocationRegistryDefinitionId,
        revokedAt: change.status === "REVOKED" ? occurredAt : issuance.revokedAt,
        status: change.status === "REVOKED" ? CredentialIssuanceStatus.REVOKED : CredentialIssuanceStatus.ISSUED,
        suspendedAt: change.status === "SUSPENDED" ? occurredAt : issuance.suspendedAt,
      },
      where: { id: issuance.id },
    });

    await transaction.credentialAuditLog.createMany({
      data: {
        action: auditActionFor(change.status),
        actorId: change.actorId,
        credentialDefinitionId: issuance.credentialDefinitionId,
        credentialExchangeId: issuance.credentialExchangeId,
        credentialIssuanceId: issuance.id,
        eventId: change.eventId,
        message: messageFor(change.status),
        metadata: {
          credentialRevocationId: change.credentialRevocationId,
          previousStatus: change.previousStatus,
          reason: change.reason ?? null,
          revocationRegistryDefinitionId: change.revocationRegistryDefinitionId,
          status: change.status,
          statusListTimestamp: change.statusListTimestamp ?? null,
        },
        occurredAt,
        studentId: issuance.studentId,
      },
      skipDuplicates: true,
    });

    if (change.actorId) {
      await transaction.credentialAuditLog.updateMany({
        data: { actorId: change.actorId },
        where: { actorId: null, eventId: change.eventId },
      });
    }
  });

  return { lifecycleState: change.status, updatedAt: occurredAt.toISOString() };
}

function expectedStatusFor(action: CredentialLifecycleAction) {
  return action === "reactivate" ? "ACTIVE" : action === "suspend" ? "SUSPENDED" : "REVOKED";
}

export async function requestCredentialLifecycleChange(params: {
  action: CredentialLifecycleAction;
  actorId?: string | null;
  reason: string;
  studentId: string;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new CredentialLifecycleActionError("A reason is required for lifecycle changes.", 400);
  if (reason.length > 500) throw new CredentialLifecycleActionError("Reason must be 500 characters or fewer.", 400);

  const issuance = await prisma.credentialIssuance.findFirst({
    orderBy: { createdAt: "desc" },
    where: { credentialExchangeId: { not: null }, studentId: params.studentId },
  });
  if (!issuance?.credentialExchangeId) {
    throw new CredentialLifecycleActionError("No issued credential was found for this student.", 404);
  }

  const currentStatus = toPublicCredentialStatus(issuance);
  const allowed =
    (params.action === "suspend" && currentStatus === "ACTIVE") ||
    (params.action === "reactivate" && currentStatus === "SUSPENDED") ||
    (params.action === "revoke" && (currentStatus === "ACTIVE" || currentStatus === "SUSPENDED"));
  if (!allowed) {
    const verb = params.action === "suspend" ? "suspended" : params.action === "reactivate" ? "reactivated" : "revoked";
    throw new CredentialLifecycleActionError(
      `Credential cannot be ${verb} while its status is ${currentStatus}.`,
      409,
    );
  }

  const result: AgentCredentialLifecycleResult = await changeCredentialLifecycle(
    issuance.credentialExchangeId,
    params.action,
    reason,
  );
  const expectedStatus = expectedStatusFor(params.action);
  if (result.status !== expectedStatus) {
    throw new CredentialLifecycleActionError(
      `Agent returned ${result.status} after ${params.action}; expected ${expectedStatus}.`,
      502,
    );
  }

  return persistLifecycleChange({
    actorId: params.actorId,
    credentialExchangeId: result.credentialExchangeId,
    credentialRevocationId: result.credentialRevocationId,
    eventId: result.eventId ?? `${params.action}:${result.credentialExchangeId}:${result.updatedAt}`,
    previousStatus: currentStatus as "ACTIVE" | "SUSPENDED",
    reason,
    revocationRegistryDefinitionId: result.revocationRegistryDefinitionId,
    status: result.status,
    statusListTimestamp: result.statusListTimestamp,
    timestamp: result.updatedAt,
  });
}

export async function recordCredentialLifecycleChangedEvent(payload: CredentialLifecycleChangedWebhookPayload) {
  return persistLifecycleChange({
    credentialExchangeId: payload.credentialExchangeId,
    credentialRevocationId: payload.credentialRevocationId,
    eventId: payload.eventId,
    previousStatus: payload.previousStatus,
    reason: payload.reason,
    revocationRegistryDefinitionId: payload.revocationRegistryDefinitionId,
    status: payload.status,
    statusListTimestamp: payload.statusListTimestamp,
    timestamp: payload.timestamp,
  });
}
