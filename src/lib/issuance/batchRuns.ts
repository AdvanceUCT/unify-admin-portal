import "server-only";

import { BatchIssuanceItemStatus, BatchIssuanceRunStatus } from "@/generated/prisma/enums";
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
import { prisma } from "@/lib/db/prisma";
import { getAllStudents, updateStudentStatus } from "@/lib/db/store";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { parseBatchIssuanceSelection, attributesForStudent, getActiveCredentialDefinition } from "@/lib/issuance/batchIssuance";
import {
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
} from "@/lib/student-records/simulatedUniversityRecords";

type PersistedBatchItem = {
  activationId: string | null;
  activationUrl: string | null;
  activatedAt: Date | null;
  credentialExchangeId: string | null;
  credentialId: string;
  deliveredAt: Date | null;
  email: string | null;
  expiresAt: Date | null;
  faculty: string | null;
  failureReason: string | null;
  holderName: string;
  programme: string | null;
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
  items: PersistedBatchItem[];
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

function publicRunStatus(status: BatchIssuanceRunStatus): BatchIssuanceRunSummary["status"] {
  return status
    .toLowerCase()
    .replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^([a-z])/, (_match, char: string) => char.toUpperCase()) as BatchIssuanceRunSummary["status"];
}

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
    (!selection.enrolmentStatus || student.credential.enrolmentStatus === selection.enrolmentStatus) &&
    (!selection.credentialStatus || student.credential.lifecycleState === selection.credentialStatus)
  );
}

function skipReasonFor(student: StudentRecord) {
  if (student.credential.enrolmentStatus !== "Registered") {
    return `Enrolment status is ${student.credential.enrolmentStatus}.`;
  }

  return `Credential status is ${student.credential.lifecycleState}.`;
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
    studentId: student.profile.id,
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

function toItem(item: PersistedBatchItem): BatchIssuanceRunItem {
  return {
    activationId: item.activationId ?? undefined,
    activationUrl: item.activationUrl ?? undefined,
    activatedAt: iso(item.activatedAt),
    credentialExchangeId: item.credentialExchangeId ?? undefined,
    credentialId: item.credentialId,
    deliveredAt: iso(item.deliveredAt),
    email: item.email ?? undefined,
    expiresAt: iso(item.expiresAt),
    faculty: item.faculty ?? undefined,
    failureReason: item.failureReason ?? undefined,
    holderName: item.holderName,
    programme: item.programme ?? undefined,
    skipReason: item.skipReason ?? undefined,
    status: publicItemStatus(item.status),
    studentId: item.studentId,
  };
}

function toDetail(run: PersistedBatchRun): BatchIssuanceRunDetail {
  return {
    ...toSummary(run),
    items: run.items.map(toItem),
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

export async function previewBatchIssuance(selectionInput?: BatchIssuanceSelection): Promise<BatchIssuancePreviewResult> {
  const selection = parseBatchIssuanceSelection(selectionInput);
  const students = await getAllStudents();
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
          credentialId: item.credentialId,
          email: item.email,
          faculty: item.faculty,
          holderName: item.holderName,
          programme: item.programme,
          skipReason: item.reason,
          status: item.status === "Eligible" ? BatchIssuanceItemStatus.PENDING : BatchIssuanceItemStatus.SKIPPED,
          studentId: item.studentId,
        })),
      },
    },
    include: { items: true },
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

export async function processBatchRun(batchId: string): Promise<BatchIssuanceRunDetail> {
  const run = await prisma.batchIssuanceRun.findUnique({ include: { items: true }, where: { batchId } });
  if (!run) {
    throw new Error("Batch issuance run was not found.");
  }

  const pendingItems = run.items.filter((item) => retryableItemStatuses.has(item.status));

  await prisma.batchIssuanceRun.update({
    data: { startedAt: new Date(), status: BatchIssuanceRunStatus.PROCESSING },
    where: { batchId },
  });

  if (pendingItems.length === 0) {
    return getBatchRunDetail(batchId);
  }

  const students = await getAllStudents();
  const studentsById = new Map(students.map((student) => [student.profile.id, student]));
  const activeSchema = await getActiveCredentialDefinition();
  const agentResult = await createBatchActivationLinks({
    credentialDefinitionId: activeSchema.credentialDefinitionId,
    students: pendingItems
      .map((item) => studentsById.get(item.studentId))
      .filter((student): student is StudentRecord => Boolean(student))
      .map((student) => ({
        attributes: attributesForStudent(student, activeSchema.schemaAttributes),
        email: student.profile.email,
        externalId: student.profile.id,
      })),
  });
  const offerByStudentId = new Map(agentResult.offers.map((offer) => [offer.externalId, offer]));
  const failureByStudentId = new Map(agentResult.failures.map((failure) => [failure.externalId, failure]));

  for (const item of pendingItems) {
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
      await updateStudentStatus(student.profile.id, "Offered");
    } catch (error) {
      delivery = {
        emailStatus: "Failed",
        failureReason: error instanceof Error ? error.message : String(error),
        status: "Failed",
      };
    }

    await prisma.batchIssuanceItem.update({
      data: {
        activationId: offer.activationId,
        activationUrl: publicActivationUrl,
        credentialExchangeId: offer.credentialExchangeId,
        deliveredAt: delivery.deliveredAt ? new Date(delivery.deliveredAt) : null,
        expiresAt: new Date(offer.expiresAt),
        failureReason: delivery.failureReason,
        status: delivery.status === "Delivered" ? BatchIssuanceItemStatus.DELIVERED : BatchIssuanceItemStatus.DELIVERY_FAILED,
      },
      where: { id: item.id },
    });
  }

  const updatedRun = await prisma.batchIssuanceRun.findUniqueOrThrow({ include: { items: true }, where: { batchId } });
  const delivered = updatedRun.items.filter((item) => item.status === BatchIssuanceItemStatus.DELIVERED).length;
  const failed = updatedRun.items.filter((item) => failedItemStatuses.has(item.status)).length;
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
      status,
    },
    include: { items: true },
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
      status: publicRunStatus(status),
    },
  });

  return toDetail(finalRun);
}

export async function listBatchRuns(): Promise<BatchIssuanceRunSummary[]> {
  const runs = await prisma.batchIssuanceRun.findMany({
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return runs.map(toSummary);
}

export async function getBatchRunDetail(batchId: string): Promise<BatchIssuanceRunDetail> {
  const run = await prisma.batchIssuanceRun.findUnique({ include: { items: true }, where: { batchId } });
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
  return processBatchRun(batchId);
}
