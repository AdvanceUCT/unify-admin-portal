import "server-only";

import { CredentialAuditAction, CredentialDeliveryStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { CredentialAuditLogModel } from "@/generated/prisma/models";
import type { CredentialAuditLogEntry } from "@/lib/api/types";
import { prisma } from "@/lib/db/prisma";

type RecordCredentialReissueRequestedAuditInput = {
  actorId?: string | null;
  credentialDefinitionId: string;
  credentialExchangeId?: string | null;
  credentialIssuanceId: string;
  studentId: string;
  trigger: "AUTO" | "MANUAL";
};

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

function publicDeliveryStatus(status: CredentialDeliveryStatus | null) {
  if (status === CredentialDeliveryStatus.DELIVERED) return "Delivered" as const;
  if (status === CredentialDeliveryStatus.FAILED) return "Failed" as const;
  return status === CredentialDeliveryStatus.PENDING ? "Pending" as const : null;
}

function publicCredentialAuditLog(log: CredentialAuditLogModel) {
  return {
    action: log.action,
    actorId: log.actorId,
    batchId: log.batchId,
    batchItemId: log.batchItemId,
    credentialDefinitionId: log.credentialDefinitionId,
    credentialExchangeId: log.credentialExchangeId,
    credentialIssuanceId: log.credentialIssuanceId,
    deliveryStatus: publicDeliveryStatus(log.deliveryStatus),
    id: log.id,
    message: log.message,
    occurredAt: log.occurredAt.toISOString(),
    studentId: log.studentId,
  };
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
 * Writes a `REISSUE_REQUESTED` audit log entry for a credential renewal.
 * Accepts an optional transaction client so it can be written atomically
 * alongside the status flip that expires the old issuance.
 */
export async function recordCredentialReissueRequestedAudit(
  {
    actorId,
    credentialDefinitionId,
    credentialExchangeId,
    credentialIssuanceId,
    studentId,
    trigger,
  }: RecordCredentialReissueRequestedAuditInput,
  database: Pick<Prisma.TransactionClient, "credentialAuditLog"> = prisma,
) {
  await database.credentialAuditLog.create({
    data: {
      action: CredentialAuditAction.REISSUE_REQUESTED,
      actorId,
      credentialDefinitionId,
      credentialExchangeId,
      credentialIssuanceId,
      message:
        trigger === "AUTO"
          ? "Credential renewal triggered automatically by the configured cadence."
          : "Credential renewal triggered manually by an administrator.",
      metadata: { trigger },
      studentId,
    },
  });
}

/**
 * Returns a paginated list of `OFFER_SENT` and `REISSUE_REQUESTED` audit log
 * entries (issuance and renewal activity). The page number is clamped between
 * 1 and the last available page so out-of-range requests always return a
 * valid result.
 *
 * @param page - The requested page number (1-indexed).
 * @param pageSize - How many entries to return per page.
 * @returns Logs for the clamped page along with total count and page metadata.
 */
export async function getPaginatedCredentialAuditLogs({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<{ logs: CredentialAuditLogEntry[]; page: number; pageSize: number; totalCount: number; totalPages: number }> {
  const currentPage = Math.max(1, page);
  const take = Math.max(1, pageSize);
  const where = {
    action: { in: [CredentialAuditAction.OFFER_SENT, CredentialAuditAction.REISSUE_REQUESTED] },
  };
  const totalCount = await prisma.credentialAuditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / take));
  const clampedPage = Math.min(currentPage, totalPages);
  const logs = await prisma.credentialAuditLog.findMany({
    orderBy: { occurredAt: "desc" },
    skip: (clampedPage - 1) * take,
    take,
    where,
  });

  return {
    logs: logs.map(publicCredentialAuditLog),
    page: clampedPage,
    pageSize: take,
    totalCount,
    totalPages,
  };
}
