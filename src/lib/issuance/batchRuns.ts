import "server-only";

import { BatchIssuanceItemStatus, BatchIssuanceRunStatus, CredentialDeliveryStatus } from "@/generated/prisma/enums";
import type { CredentialIssuance } from "@/generated/prisma/client";
import type {
  ActivationDelivery,
  BatchIssuancePreviewItem,
  BatchIssuancePreviewResult,
  BatchIssuanceRunDetail,
  BatchIssuanceRunItem,
  BatchIssuanceRunSummary,
  BatchIssuanceSelection,
  StudentRecord,
} from "@/lib/api/types";
import { toPublicWalletActivationLink } from "@/lib/api/activationLinks";
import { createBatchActivationLinks } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { recordCredentialOfferSentAudit } from "@/lib/credentials/audit";
import {
  createCredentialIssuanceFromOffer,
  findActiveCredentialIssuance,
  overlayCredentialStatuses,
  reconcileCredentialEventLogs,
} from "@/lib/credentials/status";
import { prisma } from "@/lib/db/prisma";
import { getAllStudents } from "@/lib/students/repository";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { formatCredentialStatus } from "@/lib/formatters";
import {
  parseBatchIssuanceSelection,
  attributesForStudent,
  credentialValidityWindowFrom,
  getActiveCredentialDefinition,
} from "@/lib/issuance/batchIssuance";
import {
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
} from "@/lib/student-records/simulatedUniversityRecords";

type PersistedBatchItem = {
  failureReason: string | null;
  credentialIssuance: CredentialIssuance | null;
  credentialIssuanceId: string | null;
  skipReason: string | null;
  status: BatchIssuanceItemStatus;
  studentId: string;
};

type PersistedBatchRun = {
  activatedCount: number;
  actorId: string | null;
  batchId: string;
  cohortId: string;
  completedAt: Date | null;
  createdAt: Date;
  eligibleCount: number;
  failedCount: number;
  filters: unknown;
  issuedCount: number;
  items?: PersistedBatchItem[];
  queuedAt: Date | null;
  requestedCount: number;
  skippedCount: number;
  startedAt: Date | null;
  status: BatchIssuanceRunStatus;
};

const retryableItemStatuses = new Set<BatchIssuanceItemStatus>([
  BatchIssuanceItemStatus.PENDING,
  BatchIssuanceItemStatus.DELIVERY_FAILED,
  BatchIssuanceItemStatus.FAILED,
]);
const failedItemStatuses = new Set<BatchIssuanceItemStatus>([
  BatchIssuanceItemStatus.FAILED,
  BatchIssuanceItemStatus.DELIVERY_FAILED,
]);

/**
 * Converts a DB enum run status from SNAKE_CASE to PascalCase for API responses,
 * e.g. `PARTIALLY_FAILED` → `PartiallyFailed`.
 */
function publicRunStatus(status: BatchIssuanceRunStatus): BatchIssuanceRunSummary["status"] {
  return status
    .toLowerCase()
    .replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^([a-z])/, (_match, char: string) => char.toUpperCase()) as BatchIssuanceRunSummary["status"];
}

/**
 * Same as `publicRunStatus` but for item-level statuses,
 * e.g. `DELIVERY_FAILED` → `DeliveryFailed`.
 */
function publicItemStatus(status: BatchIssuanceItemStatus): BatchIssuanceRunItem["status"] {
  return status
    .toLowerCase()
    .replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^([a-z])/, (_match, char: string) => char.toUpperCase()) as BatchIssuanceRunItem["status"];
}

function iso(value?: Date | null) {
  return value?.toISOString();
}

function batchIdFrom(now: Date) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `batch-${timestamp}`;
}

function fullName(student: StudentRecord) {
  return `${student.profile.firstName} ${student.profile.lastName}`;
}

function filterMatches(student: StudentRecord, selection: BatchIssuanceSelection) {
  return (
    (!selection.faculty || student.credential.faculty === selection.faculty) &&
    (!selection.programme || student.credential.programme === selection.programme) &&
    (!selection.credentialStatus || student.credential.lifecycleState === selection.credentialStatus)
  );
}

function skipReasonFor(student: StudentRecord) {
  return `Credential status is ${formatCredentialStatus(student.credential.lifecycleState)}.`;
}

function previewItem(student: StudentRecord, status: "Eligible" | "Skipped", reason?: string): BatchIssuancePreviewItem {
  return {
    credentialId: student.credential.id,
    email: student.profile.email,
    faculty: student.credential.faculty,
    holderName: fullName(student),
    programme: student.credential.programme,
    reason,
    status,
    studentId: student.credential.studentNumber,
  };
}

function toSummary(run: PersistedBatchRun): BatchIssuanceRunSummary {
  return {
    activatedCount: run.activatedCount,
    actorId: run.actorId,
    batchId: run.batchId,
    cohortId: run.cohortId,
    completedAt: iso(run.completedAt),
    createdAt: run.createdAt.toISOString(),
    eligibleCount: run.eligibleCount,
    failedCount: run.failedCount,
    filters: run.filters as BatchIssuanceSelection,
    issuedCount: run.issuedCount,
    queuedAt: iso(run.queuedAt),
    requestedCount: run.requestedCount,
    skippedCount: run.skippedCount,
    startedAt: iso(run.startedAt),
    status: publicRunStatus(run.status),
  };
}

function toItem(item: PersistedBatchItem, student?: StudentRecord): BatchIssuanceRunItem {
  const issuance = item.credentialIssuance;

  return {
    activationId: issuance?.activationId ?? undefined,
    activationUrl: issuance?.activationUrl ?? undefined,
    credentialExchangeId: issuance?.credentialExchangeId ?? undefined,
    credentialId: issuance?.id ?? item.credentialIssuanceId ?? item.studentId,
    deliveredAt: issuance?.deliveryStatus === "DELIVERED" ? issuance.createdAt.toISOString() : undefined,
    email: issuance?.email ?? student?.profile.email,
    expiresAt: iso(issuance?.activationExpiresAt),
    faculty: student?.credential.faculty,
    failureReason: item.failureReason ?? undefined,
    holderName: student ? fullName(student) : item.studentId,
    programme: student?.credential.programme,
    skipReason: item.skipReason ?? undefined,
    status: publicItemStatus(item.status),
    studentId: item.studentId,
  };
}

/**
 * Builds the full run detail by attaching each item's matching student record.
 * The lookup map uses both `studentNumber` and `profile.id` as keys since batch
 * items can be stored under either identifier depending on how the run was created.
 */
async function toDetail(run: PersistedBatchRun & { items: PersistedBatchItem[] }): Promise<BatchIssuanceRunDetail> {
  const students = await getAllStudents();
  const studentsById = new Map(
    students.flatMap((student) => [
      [student.credential.studentNumber, student] as const,
      [student.profile.id, student] as const,
    ]),
  );

  return {
    ...toSummary(run),
    items: run.items.map((item) => toItem(item, studentsById.get(item.studentId))),
  };
}

async function sendActivationEmail(student: StudentRecord, delivery: { activationUrl: string; expiresAt: string }) {
  await sendCredentialActivationEmail({
    activationUrl: delivery.activationUrl,
    expiresAt: delivery.expiresAt,
    studentName: fullName(student),
    to: student.profile.email,
  });
}

/**
 * Shows a preview of which students would be included in a batch issuance for the
 * given filters, split into eligible and skipped with reasons. No credentials are issued.
 *
 * @param selectionInput - Optional filters (faculty, programme, enrolment/credential status, limit).
 * @returns Preview result with eligible/skipped counts and a per-student item list.
 */
export async function previewBatchIssuance(selectionInput?: BatchIssuanceSelection): Promise<BatchIssuancePreviewResult> {
  const selection = parseBatchIssuanceSelection(selectionInput);
  const students = await overlayCredentialStatuses(await getAllStudents());
  const matchingStudents = students.filter((student) => filterMatches(student, selection));
  const eligibleStudents = selectStudentRecordsForCredentialIssuance(students, selection);
  const eligibleIds = new Set(eligibleStudents.map((student) => student.profile.id));
  const selectedIds = new Set(eligibleStudents.map((student) => student.profile.id));
  const limitedMatchingStudents = selection.limit ? matchingStudents.slice(0, selection.limit) : matchingStudents;
  const skippedItems = limitedMatchingStudents
    .filter((student) => !eligibleIds.has(student.profile.id))
    .map((student) => previewItem(student, "Skipped", skipReasonFor(student)));
  const eligibleItems = eligibleStudents.map((student) => previewItem(student, "Eligible"));

  return {
    cohortId: selection.cohortId ?? SIMULATED_STUDENT_COHORT_ID,
    eligibleCount: selectedIds.size,
    filters: selection,
    items: [...eligibleItems, ...skippedItems],
    requestedCount: eligibleItems.length + skippedItems.length,
    skippedCount: skippedItems.length,
  };
}

/**
 * Creates a new batch run in the DB from a preview result and immediately processes it.
 * Writes a creation audit log before handing off to `processBatchRun`.
 *
 * @param actorId - Who triggered the batch, if anyone.
 * @param selection - Optional filters to scope which students are included.
 * @returns The completed `BatchIssuanceRunDetail` after processing.
 */
export async function createAndProcessBatchRun({
  actorId,
  selection,
}: {
  actorId?: string | null;
  selection?: BatchIssuanceSelection;
}) {
  const now = new Date();
  const preview = await previewBatchIssuance(selection);
  const batchId = batchIdFrom(now);
  const run = await prisma.batchIssuanceRun.create({
    data: {
      actorId,
      batchId,
      cohortId: preview.cohortId,
      eligibleCount: preview.eligibleCount,
      filters: preview.filters,
      requestedCount: preview.requestedCount,
      skippedCount: preview.skippedCount,
      status: BatchIssuanceRunStatus.QUEUED,
      queuedAt: now,
      items: {
        create: preview.items.map((item) => ({
          skipReason: item.reason,
          status: item.status === "Eligible" ? BatchIssuanceItemStatus.PENDING : BatchIssuanceItemStatus.SKIPPED,
          studentId: item.studentId,
        })),
      },
    },
    include: { items: { include: { credentialIssuance: true } } },
  });

  await writeAuditLog({
    action: "BATCH_ISSUANCE_CREATED",
    actorId,
    targetType: "BatchIssuanceRun",
    targetId: batchId,
    meta: {
      eligibleCount: preview.eligibleCount,
      requestedCount: preview.requestedCount,
      skippedCount: preview.skippedCount,
    },
  });

  return processBatchRun(run.batchId);
}

/**
 * Processes all pending items in a batch run. For each item it:
 * 1. Skips students that already have an active issuance.
 * 2. Calls the agent in bulk to create activation links for the rest.
 * 3. Sends activation emails and records each delivery outcome.
 * 4. Saves a `CredentialIssuance` record, syncs event logs, and writes an audit entry.
 * 5. Updates item status to `DELIVERED` or `DELIVERY_FAILED`.
 *
 * Once all items are done, saves final counts and marks the run as `COMPLETED`,
 * `PARTIALLY_FAILED`, or `FAILED`. Also used by `retryFailedBatchRun`.
 *
 * @param batchId - The batch run to process.
 * @param actorIdOverride - Overrides the stored actor ID in audit logs if provided.
 * @returns The final `BatchIssuanceRunDetail`.
 * @throws If the batch run is not found.
 */
export async function processBatchRun(batchId: string, actorIdOverride?: string | null): Promise<BatchIssuanceRunDetail> {
  const run = await prisma.batchIssuanceRun.findUnique({
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });
  if (!run) {
    throw new Error("Batch issuance run was not found.");
  }
  const auditActorId = actorIdOverride ?? run.actorId;

  const pendingItems = run.items.filter((item) => retryableItemStatuses.has(item.status));

  const offerCreatedAt = new Date();
  await prisma.batchIssuanceRun.update({
    data: { startedAt: offerCreatedAt, status: BatchIssuanceRunStatus.PROCESSING },
    where: { batchId },
  });

  if (pendingItems.length === 0) {
    return getBatchRunDetail(batchId);
  }

  const students = await getAllStudents();
  const activeSchema = await getActiveCredentialDefinition();
  const validityWindow = credentialValidityWindowFrom(offerCreatedAt, activeSchema.credentialValidityDays);
  const studentsById = new Map(
    students.flatMap((student) => [
      [student.credential.studentNumber, student] as const,
      [student.profile.id, student] as const,
    ]),
  );
  const blockedItems = new Set<string>();

  await Promise.all(
    pendingItems.map(async (item) => {
      const activeIssuance = await findActiveCredentialIssuance({
        credentialDefinitionId: activeSchema.credentialDefinitionId,
        studentId: item.studentId,
      });

      if (activeIssuance) {
        blockedItems.add(item.id);
        await prisma.batchIssuanceItem.update({
          data: {
            credentialIssuanceId: activeIssuance.id,
            skipReason: `Student already has an active credential issuance in status ${activeIssuance.status}.`,
            status: BatchIssuanceItemStatus.SKIPPED,
          },
          where: { id: item.id },
        });
      }
    }),
  );
  const allowedPendingItems = pendingItems.filter((item) => !blockedItems.has(item.id));

  const agentResult =
    allowedPendingItems.length === 0
      ? { failures: [], offers: [] }
      : await createBatchActivationLinks({
          credentialDefinitionId: activeSchema.credentialDefinitionId,
          ...(activeSchema.revocationRegistryDefinitionId
            ? { revocationRegistryDefinitionId: activeSchema.revocationRegistryDefinitionId }
            : {}),
          students: allowedPendingItems
            .map((item) => studentsById.get(item.studentId))
            .filter((student): student is StudentRecord => Boolean(student))
            .map((student) => ({
              attributes: attributesForStudent(student, activeSchema.schemaAttributes, validityWindow),
              email: student.profile.email,
              externalId: student.credential.studentNumber,
            })),
        });
  const offerByStudentId = new Map(agentResult.offers.map((offer) => [offer.externalId, offer]));
  const failureByStudentId = new Map(agentResult.failures.map((failure) => [failure.externalId, failure]));

  for (const item of allowedPendingItems) {
    const student = studentsById.get(item.studentId);
    const offer = offerByStudentId.get(item.studentId);
    const failure = failureByStudentId.get(item.studentId);

    if (!student) {
      await prisma.batchIssuanceItem.update({
        data: {
          failureReason: "Student record was not found during batch processing.",
          status: BatchIssuanceItemStatus.FAILED,
        },
        where: { id: item.id },
      });
      continue;
    }

    if (failure || !offer) {
      await prisma.batchIssuanceItem.update({
        data: {
          failureReason: failure?.message ?? "Agent service did not return an offer for this student.",
          status: BatchIssuanceItemStatus.FAILED,
        },
        where: { id: item.id },
      });
      continue;
    }

    const publicActivationUrl = toPublicWalletActivationLink(offer.activationUrl);
    const publicOffer = { ...offer, activationUrl: publicActivationUrl };
    let delivery: Partial<ActivationDelivery> = {};
    try {
      await sendActivationEmail(student, publicOffer);
      delivery = { deliveredAt: new Date().toISOString(), emailStatus: "Sent", status: "Delivered" };
    } catch (error) {
      delivery = {
        emailStatus: "Failed",
        failureReason: error instanceof Error ? error.message : String(error),
        status: "Failed",
      };
    }

    const issuance = await createCredentialIssuanceFromOffer({
      activationId: offer.activationId,
      activationUrl: publicActivationUrl,
      credentialDefinitionId: activeSchema.credentialDefinitionId,
      credentialExchangeId: offer.credentialExchangeId,
      credentialExpiresAt: validityWindow.expiresAt,
      credentialRevocationId: offer.credentialRevocationId,
      email: offer.email,
      expiresAt: offer.expiresAt,
      failureReason: delivery.failureReason,
      revocationRegistryDefinitionId: offer.revocationRegistryDefinitionId,
      schemaVersion: activeSchema.schemaVersion,
      studentId: item.studentId,
      wasDelivered: delivery.status === "Delivered",
    });
    await reconcileCredentialEventLogs(offer.credentialExchangeId);

    await recordCredentialOfferSentAudit({
      actorId: auditActorId,
      batchId,
      batchItemId: item.id,
      credentialDefinitionId: activeSchema.credentialDefinitionId,
      credentialExchangeId: offer.credentialExchangeId,
      credentialIssuanceId: issuance.id,
      deliveryStatus:
        delivery.status === "Delivered" ? CredentialDeliveryStatus.DELIVERED : CredentialDeliveryStatus.FAILED,
      failureReason: delivery.failureReason,
      studentId: item.studentId,
    });

    await prisma.batchIssuanceItem.update({
      data: {
        credentialIssuanceId: issuance.id,
        failureReason: delivery.failureReason,
        status:
          delivery.status === "Delivered" ? BatchIssuanceItemStatus.DELIVERED : BatchIssuanceItemStatus.DELIVERY_FAILED,
      },
      where: { id: item.id },
    });
  }

  const updatedRun = await prisma.batchIssuanceRun.findUniqueOrThrow({
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });
  const delivered = updatedRun.items.filter((item) => item.status === BatchIssuanceItemStatus.DELIVERED).length;
  const failed = updatedRun.items.filter((item) => failedItemStatuses.has(item.status)).length;
  const skipped = updatedRun.items.filter((item) => item.status === BatchIssuanceItemStatus.SKIPPED).length;
  const status =
    failed > 0 && delivered > 0
      ? BatchIssuanceRunStatus.PARTIALLY_FAILED
      : failed > 0
        ? BatchIssuanceRunStatus.FAILED
        : BatchIssuanceRunStatus.COMPLETED;

  const finalRun = await prisma.batchIssuanceRun.update({
    data: {
      completedAt: new Date(),
      failedCount: failed,
      issuedCount: delivered,
      skippedCount: skipped,
      status,
    },
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });

  await writeAuditLog({
    action: "BATCH_ISSUANCE_COMPLETED",
    actorId: finalRun.actorId,
    targetType: "BatchIssuanceRun",
    targetId: batchId,
    meta: {
      failedCount: failed,
      issuedCount: delivered,
      skippedCount: skipped,
      status: publicRunStatus(status),
    },
  });

  return toDetail(finalRun);
}

export async function listBatchRuns(): Promise<BatchIssuanceRunSummary[]> {
  const runs = await prisma.batchIssuanceRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return runs.map(toSummary);
}

export async function getBatchRunDetail(batchId: string): Promise<BatchIssuanceRunDetail> {
  const run = await prisma.batchIssuanceRun.findUnique({
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });
  if (!run) {
    throw new Error("Batch issuance run was not found.");
  }
  return toDetail(run);
}

export async function retryFailedBatchRun(batchId: string, actorId?: string | null) {
  await writeAuditLog({
    action: "BATCH_ISSUANCE_RETRIED",
    actorId,
    targetType: "BatchIssuanceRun",
    targetId: batchId,
  });
  return processBatchRun(batchId, actorId);
}
