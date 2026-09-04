/**
 * @fileoverview Derives the status shown for a credential issuance record.
 * @module lib/credentials/status
 */

import "server-only";

import {
  BatchIssuanceRunStatus,
  CredentialAuditAction,
  CredentialAutomationJobType,
  CredentialDeliveryStatus,
  CredentialEventType,
  CredentialIssuanceStatus,
  CredentialRenewalStatus,
  CredentialLifecycleStatus,
  VendorApplicationStatus,
} from "@/generated/prisma/enums";
import type { CredentialAutomationJob, CredentialEventLog, CredentialIssuance } from "@/generated/prisma/client";
import type { CredentialActivityEvent, DashboardSummary, StudentRecord } from "@/lib/api/types";
import { toPublicCredentialStatus, type CredentialLifecycleSource } from "@/lib/credentials/lifecycle";
import { nextRenewalAt } from "@/lib/credentials/renewalCadence";
import { prisma } from "@/lib/db/prisma";
import {
  derivedCredentialEventId,
  isRelevantCredentialStateChangedPayload,
  mapCredoStateToCredentialStatus,
  type CredentialStateChangedWebhookPayload,
} from "@/lib/credentials/statusMapping";

export { derivedCredentialEventId, mapCredoStateToCredentialStatus };

export const ACTIVE_CREDENTIAL_STATUSES = [
  CredentialIssuanceStatus.OFFER_SENT,
  CredentialIssuanceStatus.ACCEPTED,
  CredentialIssuanceStatus.ISSUED,
] as const;

function hasRevocationHandle(issuance?: Pick<CredentialLifecycleSource, "credentialRevocationId" | "revocationRegistryDefinitionId"> | null) {
  return Boolean(issuance?.revocationRegistryDefinitionId && issuance.credentialRevocationId);
}

/**
 * Groups issuances by student ID and keeps only the most recent one per student.
 * Assumes the input is already sorted newest-first, so the first entry wins.
 *
 * @param issuances - All issuances to group, ordered by most recent first.
 * @returns A map from student ID to that student's latest issuance.
 */
type IssuanceWithAutomation = CredentialIssuance & { automationJobs: CredentialAutomationJob[] };

function latestIssuanceByStudent(issuances: IssuanceWithAutomation[]) {
  const byStudent = new Map<string, IssuanceWithAutomation>();

  for (const issuance of issuances) {
    if (!byStudent.has(issuance.studentId)) {
      byStudent.set(issuance.studentId, issuance);
    }
  }

  return byStudent;
}

function automationJobsByStudent(issuances: IssuanceWithAutomation[]) {
  const byStudent = new Map<string, CredentialAutomationJob[]>();
  for (const issuance of issuances) {
    const jobs = byStudent.get(issuance.studentId) ?? [];
    jobs.push(...issuance.automationJobs);
    byStudent.set(issuance.studentId, jobs);
  }
  for (const jobs of byStudent.values()) {
    jobs.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }
  return byStudent;
}

function withStudentAutomation(
  issuance: IssuanceWithAutomation | undefined,
  jobs: CredentialAutomationJob[],
) {
  return issuance ? { ...issuance, automationJobs: jobs } : undefined;
}

export function overlayCredentialStatus(
  student: StudentRecord,
  issuance?: CredentialLifecycleSource &
    Pick<CredentialIssuance, "credentialDefinitionId" | "credentialExchangeId" | "credentialExpiresAt" | "id" | "issuedAt" | "schemaVersion"> &
    { automationJobs?: CredentialAutomationJob[] },
  renewalSettings?: { automaticCredentialRenewalEnabled: boolean; renewalCadenceMonths: number } | null,
): StudentRecord {
  const currentJob = issuance?.automationJobs?.find((job) =>
    job.status === "PENDING" || job.status === "PROCESSING" || job.status === "FAILED",
  );
  const scheduledReactivation = issuance?.automationJobs?.find(
    (job) => job.type === "AUTO_REACTIVATE" && (job.status === "PENDING" || job.status === "PROCESSING"),
  );
  return {
    ...student,
    credential: {
      ...student.credential,
      id: issuance?.id ?? student.credential.id,
      isRevocable: hasRevocationHandle(issuance),
      lifecycleState: toPublicCredentialStatus(issuance),
      schemaVersion: issuance?.schemaVersion ?? student.credential.schemaVersion,
      validFrom: issuance?.issuedAt?.toISOString() ?? student.credential.validFrom,
      expiresAt: issuance?.credentialExpiresAt?.toISOString() ?? student.credential.expiresAt,
      nextRenewalAt:
        renewalSettings?.automaticCredentialRenewalEnabled && issuance?.issuedAt
          ? nextRenewalAt(issuance.issuedAt, renewalSettings.renewalCadenceMonths).toISOString()
          : undefined,
      scheduledReactivationAt: scheduledReactivation?.dueAt.toISOString(),
      automation: currentJob
        ? {
            attemptCount: currentJob.attemptCount,
            dueAt: currentJob.dueAt.toISOString(),
            id: currentJob.id,
            lastError: currentJob.lastError ?? undefined,
            status: currentJob.status,
            type: currentJob.type,
          }
        : undefined,
    },
  };
}

/**
 * Fetches the latest credential issuance for each student and merges it into
 * their record. Looks up by both `studentNumber` and `profile.id` since either
 * may have been used when the issuance was created.
 *
 * @param students - The list of students to enrich with live credential statuses.
 * @returns The same list with `lifecycleState` updated on each student's credential.
 */
export async function overlayCredentialStatuses(students: StudentRecord[]): Promise<StudentRecord[]> {
  if (students.length === 0) {
    return students;
  }
  const studentIds = students.flatMap((student) => [student.credential.studentNumber, student.profile.id]);

  const [issuances, renewalSettings] = await Promise.all([
    prisma.credentialIssuance.findMany({
      include: { automationJobs: { orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      where: { studentId: { in: studentIds } },
    }),
    prisma.universityProfile.findFirst({
      select: { automaticCredentialRenewalEnabled: true, renewalCadenceMonths: true },
    }),
  ]);
  const issuancesByStudent = latestIssuanceByStudent(issuances);
  const jobsByStudent = automationJobsByStudent(issuances);

  return students.map((student) => {
    const lookupIds = [student.credential.studentNumber, student.profile.id];
    const latestIssuance = lookupIds
      .map((studentId) => issuancesByStudent.get(studentId))
      .filter((issuance): issuance is IssuanceWithAutomation => Boolean(issuance))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
    const automationJobs = lookupIds.flatMap((studentId) => jobsByStudent.get(studentId) ?? [])
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return overlayCredentialStatus(
      student,
      withStudentAutomation(latestIssuance, automationJobs),
      renewalSettings,
    );
  });
}

export async function overlayCredentialStatusForStudent(student: StudentRecord): Promise<StudentRecord> {
  const [issuances, renewalSettings] = await Promise.all([
    prisma.credentialIssuance.findMany({
      include: { automationJobs: { orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      where: { studentId: { in: [student.credential.studentNumber, student.profile.id] } },
    }),
    prisma.universityProfile.findFirst({
      select: { automaticCredentialRenewalEnabled: true, renewalCadenceMonths: true },
    }),
  ]);

  const issuance = issuances[0];
  const automationJobs = issuances.flatMap((candidate) => candidate.automationJobs)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  return overlayCredentialStatus(student, withStudentAutomation(issuance, automationJobs), renewalSettings);
}

export async function findActiveCredentialIssuance(params: {
  credentialDefinitionId: string;
  studentId: string;
}) {
  return prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: {
      credentialDefinitionId: params.credentialDefinitionId,
      status: { in: [...ACTIVE_CREDENTIAL_STATUSES] },
      studentId: params.studentId,
    },
  });
}

export async function assertCredentialIssuanceAllowed(params: {
  credentialDefinitionId: string;
  studentId: string;
}) {
  const activeIssuance = await findActiveCredentialIssuance(params);

  if (activeIssuance) {
    throw new Error(
      `Student already has an active credential issuance in status ${activeIssuance.status}.`,
    );
  }
}

export async function createCredentialIssuanceFromOffer(params: {
  activationId?: string;
  activationUrl?: string;
  credentialDefinitionId: string;
  credentialExchangeId: string;
  credentialExpiresAt?: Date;
  credentialRevocationId?: string;
  deliveryStatus?: CredentialDeliveryStatus;
  email?: string;
  expiresAt?: string;
  failureReason?: string;
  revocationRegistryDefinitionId?: string;
  schemaVersion?: string;
  studentId: string;
  renewedFromIssuanceId?: string;
  wasDelivered: boolean;
}) {
  const deliveryStatus = params.deliveryStatus ??
    (params.wasDelivered ? CredentialDeliveryStatus.DELIVERED : CredentialDeliveryStatus.FAILED);
  const data = {
      activationId: params.activationId,
      activationExpiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
      activationUrl: params.activationUrl,
      credentialDefinitionId: params.credentialDefinitionId,
      credentialExchangeId: params.credentialExchangeId,
      credentialExpiresAt: params.credentialExpiresAt,
      credentialRevocationId: params.credentialRevocationId,
      deliveryStatus,
      email: params.email,
      failureReason: params.failureReason,
      revocationRegistryDefinitionId: params.revocationRegistryDefinitionId,
      schemaVersion: params.schemaVersion,
      status: deliveryStatus === CredentialDeliveryStatus.FAILED
        ? CredentialIssuanceStatus.FAILED
        : CredentialIssuanceStatus.OFFER_SENT,
      studentId: params.studentId,
      renewedFromIssuanceId: params.renewedFromIssuanceId,
      renewalStatus: params.renewedFromIssuanceId ? CredentialRenewalStatus.PENDING : CredentialRenewalStatus.NONE,
      renewalRequestedAt: params.renewedFromIssuanceId ? new Date() : undefined,
    };
  return prisma.credentialIssuance.upsert({
    create: data,
    update: {
      activationExpiresAt: data.activationExpiresAt,
      activationUrl: data.activationUrl,
      deliveryStatus: data.deliveryStatus,
      email: data.email,
      failureReason: data.failureReason,
    },
    where: { credentialExchangeId: params.credentialExchangeId },
  });
}

/**
 * Guards against downgrading a status back to `OFFER_SENT`.
 * Once a credential has moved past that state, an `OFFER_SENT` event
 * from a replayed or out-of-order webhook should not overwrite it.
 *
 * @param mappedStatus - The status we're about to apply.
 * @param currentStatus - The status currently stored in the DB.
 * @returns `true` if it's safe to apply the new status.
 */
function shouldApplyStatus(
  mappedStatus: CredentialIssuanceStatus,
  currentStatus?: CredentialIssuanceStatus | null,
) {
  if (mappedStatus === CredentialIssuanceStatus.OFFER_SENT) {
    return !currentStatus || currentStatus === CredentialIssuanceStatus.OFFER_SENT;
  }

  return true;
}

/**
 * Replays all stored event logs for a credential exchange and updates the
 * issuance record to reflect the correct final status.
 *
 * Useful after an issuance is first created, since webhook events may have
 * arrived and been stored before the issuance record existed. Only writes
 * to the DB if the status or `issuedAt` timestamp actually changed.
 *
 * @param credentialExchangeId - The exchange ID to reconcile.
 */
export async function reconcileCredentialEventLogs(credentialExchangeId: string) {
  const issuance = await prisma.credentialIssuance.findUnique({ where: { credentialExchangeId } });
  if (!issuance) {
    return;
  }

  const events = await prisma.credentialEventLog.findMany({
    orderBy: { occurredAt: "asc" },
    where: { credentialExchangeId },
  });
  let credentialRevocationId = issuance.credentialRevocationId;
  let lifecycleStatus = issuance.lifecycleStatus;
  let lifecycleStatusUpdatedAt = issuance.lifecycleStatusUpdatedAt;
  let revocationRegistryDefinitionId = issuance.revocationRegistryDefinitionId;
  let status = issuance.status;
  let issuedAt = issuance.issuedAt;

  for (const event of events) {
    const mapped = mapCredoStateToCredentialStatus(event.state, status);
    if (!mapped || !shouldApplyStatus(mapped, status)) continue;
    const payload = event.payload as CredentialStateChangedWebhookPayload;
    status = mapped;
    if (mapped === CredentialIssuanceStatus.ISSUED) {
      issuedAt = event.occurredAt;
      credentialRevocationId = payload.credentialRevocationId ?? credentialRevocationId;
      revocationRegistryDefinitionId = payload.revocationRegistryDefinitionId ?? revocationRegistryDefinitionId;
      if (credentialRevocationId && revocationRegistryDefinitionId) {
        lifecycleStatus = CredentialLifecycleStatus.ACTIVE;
        lifecycleStatusUpdatedAt = event.occurredAt;
      }
    }
  }

  if (
    status !== issuance.status ||
    issuedAt?.getTime() !== issuance.issuedAt?.getTime() ||
    credentialRevocationId !== issuance.credentialRevocationId ||
    revocationRegistryDefinitionId !== issuance.revocationRegistryDefinitionId ||
    lifecycleStatus !== issuance.lifecycleStatus ||
    lifecycleStatusUpdatedAt?.getTime() !== issuance.lifecycleStatusUpdatedAt?.getTime()
  ) {
    await prisma.credentialIssuance.update({
      data: {
        credentialRevocationId,
        issuedAt,
        lifecycleStatus,
        lifecycleStatusUpdatedAt,
        revocationRegistryDefinitionId,
        status,
      },
      where: { id: issuance.id },
    });

    if (status === CredentialIssuanceStatus.ISSUED && issuance.renewedFromIssuanceId) {
      const deduplicationKey = `revoke-replaced:${issuance.renewedFromIssuanceId}:${issuance.id}`;
      await prisma.credentialAutomationJob.upsert({
        create: {
          credentialIssuanceId: issuance.renewedFromIssuanceId,
          deduplicationKey,
          dueAt: issuedAt ?? new Date(),
          metadata: { replacementIssuanceId: issuance.id },
          type: CredentialAutomationJobType.REVOKE_REPLACED,
        },
        update: {},
        where: { deduplicationKey },
      });
    }
  }
}

/**
 * Handles an incoming `credential.stateChanged` webhook event.
 *
 * Skips irrelevant events and deduplicates using `skipDuplicates` on the event log.
 * If the event is new and a matching issuance exists, updates its status —
 * guarded by `shouldApplyStatus` to prevent out-of-order overwrites.
 *
 * @param payload - The webhook payload from the agent.
 * @returns `{ duplicate: true }` if already seen, `{ ignored: true }` if not relevant,
 *          or `{ duplicate: false, status }` with the applied status.
 */
export async function recordCredentialStateChangedEvent(payload: CredentialStateChangedWebhookPayload) {
  if (!isRelevantCredentialStateChangedPayload(payload)) {
    return { duplicate: false, ignored: true };
  }

  const eventId = payload.eventId ?? derivedCredentialEventId(payload);
  const occurredAt = new Date(payload.timestamp);
  const existingIssuance = await prisma.credentialIssuance.findUnique({
    where: { credentialExchangeId: payload.credentialExchangeId },
  });
  const mappedStatus = mapCredoStateToCredentialStatus(payload.state, existingIssuance?.status);

  const createResult = await prisma.credentialEventLog.createMany({
    data: {
      credentialDefinitionId: payload.credentialDefinitionId,
      credentialExchangeId: payload.credentialExchangeId,
      eventId,
      occurredAt,
      payload,
      previousState: payload.previousState ?? null,
      state: payload.state,
      status: mappedStatus,
      type: CredentialEventType.CREDENTIAL_STATE_CHANGED,
    },
    skipDuplicates: true,
  });

  if (createResult.count === 0) {
    return { duplicate: true, status: existingIssuance?.status };
  }

  if (existingIssuance && mappedStatus) {
    if (shouldApplyStatus(mappedStatus, existingIssuance.status)) {
      const hasRevocationMetadata = Boolean(payload.credentialRevocationId && payload.revocationRegistryDefinitionId);
      await prisma.credentialIssuance.update({
        data: {
          credentialRevocationId: payload.credentialRevocationId ?? existingIssuance.credentialRevocationId,
          issuedAt: mappedStatus === CredentialIssuanceStatus.ISSUED ? occurredAt : existingIssuance.issuedAt,
          lifecycleStatus:
            mappedStatus === CredentialIssuanceStatus.ISSUED && hasRevocationMetadata
              ? CredentialLifecycleStatus.ACTIVE
              : existingIssuance.lifecycleStatus,
          lifecycleStatusUpdatedAt:
            mappedStatus === CredentialIssuanceStatus.ISSUED && hasRevocationMetadata
              ? occurredAt
              : existingIssuance.lifecycleStatusUpdatedAt,
          revocationRegistryDefinitionId:
            payload.revocationRegistryDefinitionId ?? existingIssuance.revocationRegistryDefinitionId,
          status: mappedStatus,
        },
        where: { id: existingIssuance.id },
      });

      if (
        mappedStatus === CredentialIssuanceStatus.ISSUED &&
        existingIssuance.status !== CredentialIssuanceStatus.ISSUED &&
        hasRevocationMetadata
      ) {
        await prisma.credentialAuditLog.createMany({
          data: {
            action: CredentialAuditAction.CREDENTIAL_LIFECYCLE_ACTIVATED,
            credentialDefinitionId:
              existingIssuance.credentialDefinitionId ?? payload.credentialDefinitionId ?? "unknown",
            credentialExchangeId: payload.credentialExchangeId,
            credentialIssuanceId: existingIssuance.id,
            eventId: `credential-activated:${payload.credentialExchangeId}`,
            message: "Credential activated.",
            metadata: {
              credentialRevocationId: payload.credentialRevocationId,
              revocationRegistryDefinitionId: payload.revocationRegistryDefinitionId,
            },
            occurredAt,
            studentId: existingIssuance.studentId,
          },
          skipDuplicates: true,
        });

        if (existingIssuance.renewedFromIssuanceId) {
          const deduplicationKey = `revoke-replaced:${existingIssuance.renewedFromIssuanceId}:${existingIssuance.id}`;
          await prisma.credentialAutomationJob.upsert({
            create: {
              credentialIssuanceId: existingIssuance.renewedFromIssuanceId,
              deduplicationKey,
              dueAt: occurredAt,
              metadata: { replacementIssuanceId: existingIssuance.id },
              type: CredentialAutomationJobType.REVOKE_REPLACED,
            },
            update: {},
            where: { deduplicationKey },
          });
        }
      }
    }
  }

  return { duplicate: false, status: mappedStatus };
}

export async function getCredentialDeliveryByIssuanceId(issuanceId: string) {
  const issuance = await prisma.credentialIssuance.findUnique({ where: { id: issuanceId } });
  if (!issuance?.activationUrl) {
    return undefined;
  }

  return {
    activationId: issuance.activationId ?? undefined,
    activationUrl: issuance.activationUrl,
    batchId: "individual",
    channel: "activation-link" as const,
    credentialExchangeId: issuance.credentialExchangeId ?? undefined,
    credentialId: issuance.id,
    deliveredAt: issuance.deliveryStatus === CredentialDeliveryStatus.DELIVERED ? issuance.createdAt.toISOString() : undefined,
    email: issuance.email ?? undefined,
    expiresAt: issuance.activationExpiresAt?.toISOString() ?? issuance.createdAt.toISOString(),
    failureReason: issuance.failureReason ?? undefined,
    id: `activation-delivery-${issuance.activationId ?? issuance.id}`,
    status: issuance.deliveryStatus === CredentialDeliveryStatus.FAILED ? "Failed" as const : "Delivered" as const,
    studentId: issuance.studentId,
  };
}

export async function getDashboardCredentialSummary(): Promise<DashboardSummary> {
  const [pendingIssuance, issuedCredentials, failedCredentials, activeBatchJobs, vendorsPendingApproval] = await Promise.all([
    prisma.credentialIssuance.count({
      where: { status: { in: [CredentialIssuanceStatus.OFFER_SENT, CredentialIssuanceStatus.ACCEPTED] } },
    }),
    prisma.credentialIssuance.count({ where: { status: CredentialIssuanceStatus.ISSUED } }),
    prisma.credentialIssuance.count({ where: { status: CredentialIssuanceStatus.FAILED } }),
    prisma.batchIssuanceRun.count({
      where: { status: { in: [BatchIssuanceRunStatus.QUEUED, BatchIssuanceRunStatus.PROCESSING] } },
    }),
    prisma.vendorApplication.count({ where: { status: VendorApplicationStatus.PENDING } }),
  ]);

  return {
    activeBatchJobs,
    auditEventsToday: 0,
    failedCredentials,
    issuedCredentials,
    pendingIssuance,
    vendorsPendingApproval,
  };
}

/**
 * Fetches the most recent credential event logs and joins each one with its
 * issuance record to include the student ID in the response.
 *
 * @param limit - Max number of events to return, defaults to 10.
 * @returns A list of activity events ordered newest first.
 */
export async function getRecentCredentialActivityEvents(limit = 10): Promise<CredentialActivityEvent[]> {
  const events = await prisma.credentialEventLog.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
  const credentialExchangeIds = events
    .map((event) => event.credentialExchangeId)
    .filter((value): value is string => Boolean(value));
  const issuances =
    credentialExchangeIds.length > 0
      ? await prisma.credentialIssuance.findMany({
          where: {
            credentialExchangeId: { in: credentialExchangeIds },
          },
        })
      : [];
  const issuanceByCredentialExchangeId = new Map(
    issuances
      .filter((issuance) => issuance.credentialExchangeId)
      .map((issuance) => [issuance.credentialExchangeId, issuance]),
  );

  return events.map((event: CredentialEventLog) => {
    const issuance = issuanceByCredentialExchangeId.get(event.credentialExchangeId);
    const status = issuance
      ? toPublicCredentialStatus(issuance)
      : event.status
        ? toPublicCredentialStatus({
            credentialExpiresAt: null,
            credentialRevocationId: null,
            lifecycleStatus: null,
            revocationRegistryDefinitionId: null,
            status: event.status,
          })
        : undefined;

    return {
      credentialExchangeId: event.credentialExchangeId,
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      previousState: event.previousState ?? undefined,
      schemaVersion: issuance?.schemaVersion ?? undefined,
      state: event.state,
      status: status === "NOT_ISSUED" ? undefined : status,
      studentId: issuance?.studentId,
    };
  });
}
