/**
 * @fileoverview Reads and summarizes persisted batch issuance runs.
 * @module lib/issuance/batchRuns
 */

import "server-only";
import { randomUUID } from "node:crypto";
import {
  prepareOffer,
  deliverPreparedOffer,
} from "@/lib/credentials/preparedOffer";
import { renewalPreview } from "@/lib/credentials/academicPeriod";
import { currentValidityPolicy } from "@/lib/credentials/validityPolicy";

import {
  BatchIssuanceItemStatus,
  BatchIssuanceRunStatus,
} from "@/generated/prisma/enums";
import type { CredentialIssuance } from "@/generated/prisma/client";
import type {
  BatchIssuancePreviewItem,
  BatchIssuancePreviewResult,
  BatchIssuanceRunDetail,
  BatchIssuanceRunItem,
  BatchIssuanceRunSummary,
  BatchIssuanceSelection,
  StudentRecord,
} from "@/lib/api/types";
import { mapWithConcurrency } from "@/lib/async/mapWithConcurrency";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import {
  findActiveCredentialIssuance,
  overlayCredentialStatuses,
} from "@/lib/credentials/status";
import { prisma } from "@/lib/db/prisma";
import {
  getAllStudents,
  getStudentsByIdentifiers,
} from "@/lib/students/repository";
import { formatCredentialStatus } from "@/lib/formatters";
import {
  parseBatchIssuanceSelection,
  getActiveCredentialDefinition,
  MAX_BATCH_ISSUANCE_LIMIT,
  StudentIssuanceError,
} from "@/lib/issuance/batchIssuance";
import {
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
} from "@/lib/student-records/simulatedUniversityRecords";

type PersistedBatchItem = {
  id: string;
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
  BatchIssuanceItemStatus.OFFER_CREATED,
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
function publicRunStatus(
  status: BatchIssuanceRunStatus,
): BatchIssuanceRunSummary["status"] {
  return status
    .toLowerCase()
    .replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^([a-z])/, (_match, char: string) =>
      char.toUpperCase(),
    ) as BatchIssuanceRunSummary["status"];
}

/**
 * Same as `publicRunStatus` but for item-level statuses,
 * e.g. `DELIVERY_FAILED` → `DeliveryFailed`.
 */
function publicItemStatus(
  status: BatchIssuanceItemStatus,
): BatchIssuanceRunItem["status"] {
  return status
    .toLowerCase()
    .replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^([a-z])/, (_match, char: string) =>
      char.toUpperCase(),
    ) as BatchIssuanceRunItem["status"];
}

function iso(value?: Date | null) {
  return value?.toISOString();
}

function batchItemIdempotencyKey(batchId: string, batchItemId: string) {
  return `batch-issuance:${batchId}:${batchItemId}`;
}

function fullName(student: StudentRecord) {
  return `${student.profile.firstName} ${student.profile.lastName}`;
}
function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
function filterMatches(
  student: StudentRecord,
  selection: BatchIssuanceSelection,
) {
  return (
    (!selection.faculty || student.credential.faculty === selection.faculty) &&
    (!selection.programme ||
      student.credential.programme === selection.programme) &&
    (!selection.credentialStatus ||
      student.credential.lifecycleState === selection.credentialStatus)
  );
}

function skipReasonFor(student: StudentRecord) {
  return `Credential status is ${formatCredentialStatus(student.credential.lifecycleState)}.`;
}

function previewItem(
  student: StudentRecord,
  status: "Eligible" | "Skipped",
  reason?: string,
): BatchIssuancePreviewItem {
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
    activatedCount: run.items
      ? run.items.filter(
          (item) =>
            item.status === BatchIssuanceItemStatus.ACTIVATED ||
            item.credentialIssuance?.status === "ISSUED",
        ).length
      : run.activatedCount,
    actorId: run.actorId,
    batchId: run.batchId,
    cohortId: run.cohortId,
    completedAt: iso(run.completedAt),
    createdAt: run.createdAt.toISOString(),
    eligibleCount: run.eligibleCount,
    failedCount: run.items
      ? run.items.filter((item) => failedItemStatuses.has(item.status)).length
      : run.failedCount,
    filters: run.filters as BatchIssuanceSelection,
    issuedCount: run.items
      ? run.items.filter(
          (item) =>
            item.status === BatchIssuanceItemStatus.DELIVERED ||
            item.status === BatchIssuanceItemStatus.ACTIVATED,
        ).length
      : run.issuedCount,
    queuedAt: iso(run.queuedAt),
    requestedCount: run.requestedCount,
    skippedCount: run.items
      ? run.items.filter(
          (item) => item.status === BatchIssuanceItemStatus.SKIPPED,
        ).length
      : run.skippedCount,
    startedAt: iso(run.startedAt),
    status: publicRunStatus(run.status),
  };
}

function toItem(
  item: PersistedBatchItem,
  student?: StudentRecord,
): BatchIssuanceRunItem {
  const issuance = item.credentialIssuance;

  return {
    activationId: issuance?.activationId ?? undefined,
    activationUrl: issuance?.activationUrl ?? undefined,
    credentialExchangeId: issuance?.credentialExchangeId ?? undefined,
    credentialId: issuance?.id ?? item.credentialIssuanceId ?? item.studentId,
    deliveredAt:
      issuance?.deliveryStatus === "DELIVERED"
        ? issuance.createdAt.toISOString()
        : undefined,
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
async function toDetail(
  run: PersistedBatchRun & { items: PersistedBatchItem[] },
  knownStudents?: StudentRecord[],
): Promise<BatchIssuanceRunDetail> {
  const students =
    knownStudents ??
    (await getStudentsByIdentifiers(
      uniqueStrings(run.items.map((item) => item.studentId)),
    ));
  const studentsById = new Map(
    students.flatMap((student) => [
      [student.credential.studentNumber, student] as const,
      [student.profile.id, student] as const,
    ]),
  );

  return {
    ...toSummary(run),
    items: run.items.map((item) =>
      toItem(item, studentsById.get(item.studentId)),
    ),
  };
}

/**
 * Shows a preview of which students would be included in a batch issuance for the
 * given filters, split into eligible and skipped with reasons. No credentials are issued.
 *
 * @param selectionInput - Optional filters (faculty, programme, enrolment/credential status, limit).
 * @returns Preview result with eligible/skipped counts and a per-student item list.
 */
async function prepareBatchPreview(
  selectionInput?: BatchIssuanceSelection,
): Promise<{ preview: BatchIssuancePreviewResult; students: StudentRecord[] }> {
  const selection = parseBatchIssuanceSelection(selectionInput);
  const students = await overlayCredentialStatuses(await getAllStudents());
  const matchingStudents = students.filter((student) =>
    filterMatches(student, selection),
  );
  const allEligibleStudents = selectStudentRecordsForCredentialIssuance(
    students,
    {
      ...selection,
      limit: Number.MAX_SAFE_INTEGER,
    },
  );
  const effectiveLimit = selection.limit ?? MAX_BATCH_ISSUANCE_LIMIT;
  const eligibleStudents = allEligibleStudents.slice(0, effectiveLimit);
  const eligibleIds = new Set(
    eligibleStudents.map((student) => student.profile.id),
  );
  const allEligibleIds = new Set(
    allEligibleStudents.map((student) => student.profile.id),
  );
  const selectedIds = new Set(
    eligibleStudents.map((student) => student.profile.id),
  );
  const skippedItems = matchingStudents
    .filter((student) => !eligibleIds.has(student.profile.id))
    .map((student) =>
      previewItem(
        student,
        "Skipped",
        allEligibleIds.has(student.profile.id)
          ? `Batch maximum of ${effectiveLimit} students reached.`
          : skipReasonFor(student),
      ),
    );
  const eligibleItems = eligibleStudents.map((student) =>
    previewItem(student, "Eligible"),
  );

  return {
    students,
    preview: {
      cohortId: selection.cohortId ?? SIMULATED_STUDENT_COHORT_ID,
      eligibleCount: selectedIds.size,
      filters: selection,
      validity: renewalPreview(
        await currentValidityPolicy(),
        new Date(),
        selection,
      ),
      items: [...eligibleItems, ...skippedItems],
      requestedCount: eligibleItems.length + skippedItems.length,
      skippedCount: skippedItems.length,
    },
  };
}

export async function previewBatchIssuance(
  selectionInput?: BatchIssuanceSelection,
): Promise<BatchIssuancePreviewResult> {
  return (await prepareBatchPreview(selectionInput)).preview;
}

/**
 * Saves a queued batch without waiting for the agent or email delivery.
 *
 * @param actorId - Who triggered the batch, if anyone.
 * @param selection - Optional filters to scope which students are included.
 * @returns The queued run detail for immediate navigation.
 */
export async function createQueuedBatchRun({
  actorId,
  selection,
}: {
  actorId?: string | null;
  selection?: BatchIssuanceSelection;
}) {
  const now = new Date();
  const { preview, students } = await prepareBatchPreview(selection);
  const batchId = `batch-${randomUUID()}`;
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
          status:
            item.status === "Eligible"
              ? BatchIssuanceItemStatus.PENDING
              : BatchIssuanceItemStatus.SKIPPED,
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

  return toDetail(run, students);
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
export async function processBatchRun(
  batchId: string,
  actorIdOverride?: string | null,
): Promise<BatchIssuanceRunDetail> {
  const run = await prisma.batchIssuanceRun.findUnique({
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });
  if (!run) {
    throw new Error("Batch issuance run was not found.");
  }
  const auditActorId = actorIdOverride ?? run.actorId;

  const pendingItems = run.items.filter((item) =>
    retryableItemStatuses.has(item.status),
  );

  const offerCreatedAt = new Date();
  await prisma.batchIssuanceRun.update({
    data: {
      startedAt: offerCreatedAt,
      status: BatchIssuanceRunStatus.PROCESSING,
    },
    where: { batchId },
  });

  if (pendingItems.length === 0) {
    await prisma.batchIssuanceRun.update({
      where: { batchId },
      data: {
        status: BatchIssuanceRunStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    return getBatchRunDetail(batchId);
  }

  const students = await getAllStudents();
  const selection = parseBatchIssuanceSelection(run.filters);
  await mapWithConcurrency(
    pendingItems,
    env.BATCH_ISSUANCE_PROCESSING_CONCURRENCY,
    async (item) => {
      try {
        const student = students.find(
          (candidate) =>
            candidate.profile.id === item.studentId ||
            candidate.credential.studentNumber === item.studentId,
        );
        if (!student)
          throw new Error(
            "Student record was not found during batch processing.",
          );
        const key = batchItemIdempotencyKey(batchId, item.id);
        const replay = await prisma.credentialOfferAttempt.findUnique({
          where: { key },
        });
        if (!replay) {
          const active = await findActiveCredentialIssuance({
            studentId: item.studentId,
            credentialDefinitionId: (await getActiveCredentialDefinition())
              .credentialDefinitionId,
          });
          if (active) {
            await prisma.batchIssuanceItem.update({
              where: { id: item.id },
              data: {
                status: "SKIPPED",
                skipReason:
                  "Student already has an active credential issuance.",
              },
            });
            return;
          }
        }
        const attempt =
          replay ??
          (await prepareOffer({
            key,
            student,
            now: offerCreatedAt,
            actorId: auditActorId,
            options: selection,
          }));
        const issuance = await deliverPreparedOffer(attempt);
        await prisma.batchIssuanceItem.update({
          where: { id: item.id },
          data: {
            credentialIssuanceId: issuance.id,
            status: issuance.status === "ISSUED" ? "ACTIVATED" : "DELIVERED",
            failureReason: null,
          },
        });
      } catch (error) {
        const attempt = await prisma.credentialOfferAttempt.findUnique({
          where: { key: batchItemIdempotencyKey(batchId, item.id) },
        });
        await prisma.batchIssuanceItem.update({
          where: { id: item.id },
          data: {
            credentialIssuanceId: attempt?.issuanceId,
            status: attempt?.issuanceId ? "DELIVERY_FAILED" : "FAILED",
            failureReason:
              error instanceof Error ? error.message : "Issuance failed.",
          },
        });
      }
    },
  );

  const updatedRun = await prisma.batchIssuanceRun.findUniqueOrThrow({
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });
  const delivered = updatedRun.items.filter(
    (item) =>
      item.status === BatchIssuanceItemStatus.DELIVERED ||
      item.status === BatchIssuanceItemStatus.ACTIVATED,
  ).length;
  const failed = updatedRun.items.filter((item) =>
    failedItemStatuses.has(item.status),
  ).length;
  const skipped = updatedRun.items.filter(
    (item) => item.status === BatchIssuanceItemStatus.SKIPPED,
  ).length;
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
      activatedCount: updatedRun.items.filter(
        (item) => item.status === BatchIssuanceItemStatus.ACTIVATED,
      ).length,
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
    include: { items: { include: { credentialIssuance: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return runs.map(toSummary);
}

export async function getBatchRunDetail(
  batchId: string,
): Promise<BatchIssuanceRunDetail> {
  const run = await prisma.batchIssuanceRun.findUnique({
    include: { items: { include: { credentialIssuance: true } } },
    where: { batchId },
  });
  if (!run) {
    throw new Error("Batch issuance run was not found.");
  }
  return toDetail(run);
}

export async function retryFailedBatchRun(
  batchId: string,
  actorId?: string | null,
) {
  // Claim the retry atomically so overlapping requests cannot start two processors.
  const queued = await prisma.batchIssuanceRun.updateMany({
    where: {
      batchId,
      status: {
        in: [
          BatchIssuanceRunStatus.FAILED,
          BatchIssuanceRunStatus.PARTIALLY_FAILED,
        ],
      },
    },
    data: {
      status: BatchIssuanceRunStatus.QUEUED,
      queuedAt: new Date(),
      completedAt: null,
    },
  });
  if (!queued.count) {
    throw new StudentIssuanceError(
      "Only a finished batch with failed items can be retried.",
      409,
    );
  }
  await prisma.batchIssuanceItem.updateMany({
    where: { batchRun: { batchId }, status: { in: [...failedItemStatuses] } },
    data: { status: BatchIssuanceItemStatus.PENDING, failureReason: null },
  });
  await writeAuditLog({
    action: "BATCH_ISSUANCE_RETRIED",
    actorId,
    targetType: "BatchIssuanceRun",
    targetId: batchId,
  });
  return getBatchRunDetail(batchId);
}

/** Runs inside Next.js after(); catches unexpected failures without leaving an active run. */
export async function processBatchRunInBackground(
  batchId: string,
  actorId?: string | null,
) {
  try {
    await processBatchRun(batchId, actorId);
  } catch {
    console.error("[batch-issuance] background processing failed", { batchId });
    await prisma.batchIssuanceItem.updateMany({
      where: {
        batchRun: { batchId },
        status: { in: [...retryableItemStatuses] },
      },
      data: {
        status: BatchIssuanceItemStatus.FAILED,
        failureReason:
          "Background processing was interrupted. Retry the failed items.",
      },
    });
    const run = await getBatchRunDetail(batchId);
    await prisma.batchIssuanceRun.update({
      where: { batchId },
      data: {
        status:
          run.issuedCount > 0
            ? BatchIssuanceRunStatus.PARTIALLY_FAILED
            : BatchIssuanceRunStatus.FAILED,
        completedAt: new Date(),
        failedCount: run.failedCount,
        issuedCount: run.issuedCount,
        skippedCount: run.skippedCount,
      },
    });
  }
}
