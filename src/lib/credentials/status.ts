import "server-only";

import {
  BatchIssuanceRunStatus,
  CredentialDeliveryStatus,
  CredentialEventType,
  CredentialIssuanceStatus,
  VendorApplicationStatus,
} from "@/generated/prisma/enums";
import type { CredentialEventLog, CredentialIssuance } from "@/generated/prisma/client";
import type {
  CredentialActivityEvent,
  CredentialLifecycleState,
  DashboardSummary,
  StudentRecord,
} from "@/lib/api/types";
import { prisma } from "@/lib/db/prisma";
import {
  derivedCredentialEventId,
  isRelevantCredentialStateChangedPayload,
  mapCredoStateToCredentialStatus,
  type CredentialStateChangedWebhookPayload,
} from "@/lib/credentials/statusMapping";
import { getUniversityProfile } from "@/lib/university/profile";

export { derivedCredentialEventId, mapCredoStateToCredentialStatus };

export const ACTIVE_CREDENTIAL_STATUSES = [
  CredentialIssuanceStatus.OFFER_SENT,
  CredentialIssuanceStatus.ACCEPTED,
  CredentialIssuanceStatus.ISSUED,
] as const;

function isCredentialIssuanceStatus(value: string): value is CredentialIssuanceStatus {
  return Object.values(CredentialIssuanceStatus).includes(value as CredentialIssuanceStatus);
}

export function toPublicCredentialStatus(status?: CredentialIssuanceStatus | null): CredentialLifecycleState {
  return status && isCredentialIssuanceStatus(status) ? status : "NOT_ISSUED";
}

/**
 * Groups issuances by student ID and keeps only the most recent one per student.
 * Assumes the input is already sorted newest-first, so the first entry wins.
 *
 * @param issuances - All issuances to group, ordered by most recent first.
 * @returns A map from student ID to that student's latest issuance.
 */
function latestIssuanceByStudent(issuances: CredentialIssuance[]) {
  const byStudent = new Map<string, CredentialIssuance>();

  for (const issuance of issuances) {
    if (!byStudent.has(issuance.studentId)) {
      byStudent.set(issuance.studentId, issuance);
    }
  }

  return byStudent;
}

export function overlayCredentialStatus(
  student: StudentRecord,
  issuance?: Pick<
    CredentialIssuance,
    "id" | "status" | "credentialDefinitionId" | "credentialExchangeId" | "issuedAt" | "expiresAt"
  >,
): StudentRecord {
  return {
    ...student,
    credential: {
      ...student.credential,
      id: issuance?.id ?? student.credential.id,
      lifecycleState: toPublicCredentialStatus(issuance?.status),
      // `validFrom`/`expiresAt` on the simulated record are placeholder dates.
      // Once a real issuance has actually been granted, its real timestamps —
      // driven by the configured renewal cadence — are what's true.
      validFrom: issuance?.issuedAt?.toISOString() ?? student.credential.validFrom,
      expiresAt: issuance?.expiresAt?.toISOString() ?? student.credential.expiresAt,
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

  const issuances = await prisma.credentialIssuance.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: {
      studentId: { in: studentIds },
    },
  });
  const issuancesByStudent = latestIssuanceByStudent(issuances);

  return students.map((student) =>
    overlayCredentialStatus(
      student,
      issuancesByStudent.get(student.credential.studentNumber) ?? issuancesByStudent.get(student.profile.id),
    ),
  );
}

/**
 * Finds the most recent `CredentialIssuance` for a student, looking up by
 * both `studentNumber` and `profile.id` since either may have been used when
 * the issuance was created.
 */
export async function findLatestCredentialIssuanceForStudent(student: StudentRecord) {
  return prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: { studentId: { in: [student.credential.studentNumber, student.profile.id] } },
  });
}

export async function overlayCredentialStatusForStudent(student: StudentRecord): Promise<StudentRecord> {
  const issuance = await findLatestCredentialIssuanceForStudent(student);

  return overlayCredentialStatus(student, issuance ?? undefined);
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
  email?: string;
  expiresAt?: string;
  failureReason?: string;
  renewedFromIssuanceId?: string;
  studentId: string;
  wasDelivered: boolean;
}) {
  return prisma.credentialIssuance.create({
    data: {
      activationId: params.activationId,
      activationExpiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
      activationUrl: params.activationUrl,
      credentialDefinitionId: params.credentialDefinitionId,
      credentialExchangeId: params.credentialExchangeId,
      deliveryStatus: params.wasDelivered ? CredentialDeliveryStatus.DELIVERED : CredentialDeliveryStatus.FAILED,
      email: params.email,
      failureReason: params.failureReason,
      renewedFromIssuanceId: params.renewedFromIssuanceId,
      status: params.wasDelivered ? CredentialIssuanceStatus.OFFER_SENT : CredentialIssuanceStatus.FAILED,
      studentId: params.studentId,
    },
  });
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Computes a credential's validity expiry from the university's configured
 * renewal cadence. Returns `null` if there's no `issuedAt` yet or auto-renewal
 * is off (`renewalCadenceMonths` unset).
 *
 * @param issuedAt - When the credential was actually issued.
 */
async function computeCredentialExpiresAt(issuedAt: Date | null): Promise<Date | null> {
  if (!issuedAt) return null;

  const profile = await getUniversityProfile();
  if (!profile?.renewalCadenceMonths) return null;

  return addMonths(issuedAt, profile.renewalCadenceMonths);
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
  let status = issuance.status;
  let issuedAt = issuance.issuedAt;

  for (const event of events) {
    const mapped = mapCredoStateToCredentialStatus(event.state, status);
    if (!mapped || !shouldApplyStatus(mapped, status)) continue;
    status = mapped;
    if (mapped === CredentialIssuanceStatus.ISSUED) {
      issuedAt = event.occurredAt;
    }
  }

  if (status !== issuance.status || issuedAt?.getTime() !== issuance.issuedAt?.getTime()) {
    const expiresAt =
      status === CredentialIssuanceStatus.ISSUED && !issuance.expiresAt
        ? await computeCredentialExpiresAt(issuedAt)
        : issuance.expiresAt;

    await prisma.credentialIssuance.update({
      data: { expiresAt, issuedAt, status },
      where: { id: issuance.id },
    });
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
      const nextIssuedAt = mappedStatus === CredentialIssuanceStatus.ISSUED ? occurredAt : existingIssuance.issuedAt;
      const expiresAt =
        mappedStatus === CredentialIssuanceStatus.ISSUED && !existingIssuance.expiresAt
          ? await computeCredentialExpiresAt(nextIssuedAt)
          : existingIssuance.expiresAt;

      await prisma.credentialIssuance.update({
        data: {
          expiresAt,
          issuedAt: nextIssuedAt,
          status: mappedStatus,
        },
        where: { id: existingIssuance.id },
      });
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
  const [pendingIssuance, issuedCredentials, failedCredentials, dueForRenewalCredentials, activeBatchJobs, vendorsPendingApproval] =
    await Promise.all([
      prisma.credentialIssuance.count({
        where: { status: { in: [CredentialIssuanceStatus.OFFER_SENT, CredentialIssuanceStatus.ACCEPTED] } },
      }),
      prisma.credentialIssuance.count({ where: { status: CredentialIssuanceStatus.ISSUED } }),
      prisma.credentialIssuance.count({ where: { status: CredentialIssuanceStatus.FAILED } }),
      // Deliberately the same definition `previewDueRenewals`/the cron job use
      // (`ISSUED` + `expiresAt` past) rather than counting literal `EXPIRED`
      // rows, which are only a brief transient state a renewal passes through
      // — otherwise this number silently diverges from what the renewal
      // preview page shows for the same thing.
      prisma.credentialIssuance.count({
        where: { status: CredentialIssuanceStatus.ISSUED, expiresAt: { lte: new Date() } },
      }),
      prisma.batchIssuanceRun.count({
        where: { status: { in: [BatchIssuanceRunStatus.QUEUED, BatchIssuanceRunStatus.PROCESSING] } },
      }),
      prisma.vendorApplication.count({ where: { status: VendorApplicationStatus.PENDING } }),
    ]);

  return {
    activeBatchJobs,
    auditEventsToday: 0,
    dueForRenewalCredentials,
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

  return events.map((event: CredentialEventLog) => ({
    credentialExchangeId: event.credentialExchangeId,
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    previousState: event.previousState ?? undefined,
    state: event.state,
    status: event.status ?? undefined,
    studentId: issuanceByCredentialExchangeId.get(event.credentialExchangeId)?.studentId,
  }));
}
