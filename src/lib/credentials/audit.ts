/**
 * @fileoverview Records credential issuance and lifecycle events in the audit log.
 * @module lib/credentials/audit
 */

import "server-only";

import { CredentialAuditAction, CredentialDeliveryStatus } from "@/generated/prisma/enums";
import type { CredentialAuditLogModel } from "@/generated/prisma/models";
import type { CredentialActivityEvent, CredentialAuditLogEntry } from "@/lib/api/types";
import { credentialStatusForAuditAction } from "@/lib/formatters";
import { prisma } from "@/lib/db/prisma";

type RecordCredentialOfferSentAuditInput = {
  actorId?: string | null;
  batchId?: string | null;
  batchItemId?: string | null;
  credentialDefinitionId: string;
  credentialExchangeId: string;
  credentialIssuanceId: string;
  deliveryStatus: CredentialDeliveryStatus;
  failureReason?: string | null;
  studentId: string;
};

const DASHBOARD_CREDENTIAL_AUDIT_ACTIONS = [
  CredentialAuditAction.OFFER_SENT,
  CredentialAuditAction.CREDENTIAL_LIFECYCLE_ACTIVATED,
  CredentialAuditAction.CREDENTIAL_SUSPENDED,
  CredentialAuditAction.CREDENTIAL_REACTIVATED,
  CredentialAuditAction.CREDENTIAL_REVOKED,
] as const;

function publicDeliveryStatus(status: CredentialDeliveryStatus | null) {
  if (status === CredentialDeliveryStatus.DELIVERED) return "Delivered" as const;
  if (status === CredentialDeliveryStatus.FAILED) return "Failed" as const;
  return status === CredentialDeliveryStatus.PENDING ? "Pending" as const : null;
}

function uniqueStrings(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function publicCredentialAuditLog(
  log: CredentialAuditLogModel,
  actorsById = new Map<string, string>(),
  schemaVersionsByIssuanceId = new Map<string, string | null>(),
  schemaVersionsByCredentialExchangeId = new Map<string, string | null>(),
): CredentialAuditLogEntry {
  return {
    action: log.action,
    actorId: log.actorId,
    actorName: log.actorId ? actorsById.get(log.actorId) ?? null : null,
    batchId: log.batchId,
    batchItemId: log.batchItemId,
    credentialDefinitionId: log.credentialDefinitionId,
    credentialExchangeId: log.credentialExchangeId,
    credentialIssuanceId: log.credentialIssuanceId,
    deliveryStatus: publicDeliveryStatus(log.deliveryStatus),
    id: log.id,
    message: log.message,
    occurredAt: log.occurredAt.toISOString(),
    schemaVersion:
      (log.credentialIssuanceId ? schemaVersionsByIssuanceId.get(log.credentialIssuanceId) : undefined) ??
      (log.credentialExchangeId ? schemaVersionsByCredentialExchangeId.get(log.credentialExchangeId) : undefined) ??
      null,
    studentId: log.studentId,
  };
}

async function hydrateCredentialAuditLogs(logs: CredentialAuditLogModel[]) {
  const actorIds = uniqueStrings(logs.map((log) => log.actorId));
  const credentialIssuanceIds = uniqueStrings(logs.map((log) => log.credentialIssuanceId));
  const credentialExchangeIds = uniqueStrings(logs.map((log) => log.credentialExchangeId));

  const [actors, issuances] = await Promise.all([
    actorIds.length > 0
      ? prisma.user.findMany({
          select: { id: true, name: true },
          where: { id: { in: actorIds } },
        })
      : [],
    credentialIssuanceIds.length > 0 || credentialExchangeIds.length > 0
      ? prisma.credentialIssuance.findMany({
          select: { credentialExchangeId: true, id: true, schemaVersion: true },
          where: {
            OR: [
              ...(credentialIssuanceIds.length > 0 ? [{ id: { in: credentialIssuanceIds } }] : []),
              ...(credentialExchangeIds.length > 0
                ? [{ credentialExchangeId: { in: credentialExchangeIds } }]
                : []),
            ],
          },
        })
      : [],
  ]);

  const actorsById = new Map(actors.map((actor) => [actor.id, actor.name]));
  const schemaVersionsByIssuanceId = new Map(
    issuances.map((issuance) => [issuance.id, issuance.schemaVersion]),
  );
  const schemaVersionsByCredentialExchangeId = new Map(
    issuances
      .filter((issuance) => issuance.credentialExchangeId)
      .map((issuance) => [issuance.credentialExchangeId as string, issuance.schemaVersion]),
  );

  return logs.map((log) =>
    publicCredentialAuditLog(
      log,
      actorsById,
      schemaVersionsByIssuanceId,
      schemaVersionsByCredentialExchangeId,
    ),
  );
}

/**
 * Writes an `OFFER_SENT` audit log entry for a credential activation offer.
 * The message reflects whether the email was delivered or failed.
 * Uses `skipDuplicates` so re-runs don't create duplicate entries.
 */
export async function recordCredentialOfferSentAudit({
  actorId,
  batchId,
  batchItemId,
  credentialDefinitionId,
  credentialExchangeId,
  credentialIssuanceId,
  deliveryStatus,
  failureReason,
  studentId,
}: RecordCredentialOfferSentAuditInput) {
  await prisma.credentialAuditLog.createMany({
    data: {
      eventId: `offer:${credentialExchangeId}`,
      action: CredentialAuditAction.OFFER_SENT,
      actorId,
      batchId,
      batchItemId,
      credentialDefinitionId,
      credentialExchangeId,
      credentialIssuanceId,
      deliveryStatus,
      message:
        deliveryStatus === CredentialDeliveryStatus.DELIVERED
          ? "Credential activation offer delivered."
          : "Credential activation offer created, but email delivery failed.",
      metadata: {
        ...(failureReason ? { failureReason } : {}),
        source: "admin-portal",
      },
      studentId,
    },
    skipDuplicates: true,
  });
}

/**
 * Returns a paginated list of credential audit log entries.
 * The page number is clamped between 1 and the last available page so
 * out-of-range requests always return a valid result.
 *
 * @param page - The requested page number (1-indexed).
 * @param pageSize - How many entries to return per page.
 * @returns Logs for the clamped page along with total count and page metadata.
 */
export async function getPaginatedCredentialOfferSentAuditLogs({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<{ logs: CredentialAuditLogEntry[]; page: number; pageSize: number; totalCount: number; totalPages: number }> {
  const currentPage = Math.max(1, page);
  const take = Math.max(1, pageSize);
  const totalCount = await prisma.credentialAuditLog.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / take));
  const clampedPage = Math.min(currentPage, totalPages);
  const logs = await prisma.credentialAuditLog.findMany({
    orderBy: { occurredAt: "desc" },
    skip: (clampedPage - 1) * take,
    take,
  });

  return {
    logs: await hydrateCredentialAuditLogs(logs),
    page: clampedPage,
    pageSize: take,
    totalCount,
    totalPages,
  };
}

export async function getRecentCredentialAuditActivityEvents(limit = 10): Promise<CredentialActivityEvent[]> {
  const logs = await prisma.credentialAuditLog.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    where: { action: { in: [...DASHBOARD_CREDENTIAL_AUDIT_ACTIONS] } },
  });

  const hydratedLogs = await hydrateCredentialAuditLogs(logs);

  const events: CredentialActivityEvent[] = [];

  for (const log of hydratedLogs) {
    const status = credentialStatusForAuditAction(log.action);
    if (!status) continue;

    events.push({
      credentialExchangeId: log.credentialExchangeId ?? "",
      id: log.id,
      occurredAt: log.occurredAt,
      schemaVersion: log.schemaVersion ?? undefined,
      state: log.action,
      status,
      studentId: log.studentId,
    });
  }

  return events;
}
