import "server-only";

import {
  BatchIssuanceRunStatus,
  CredentialDeliveryStatus,
  CredentialEventType,
  CredentialIssuanceStatus,
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
  derivedConnectionEventId,
  derivedCredentialEventId,
  isRelevantCredentialStateChangedPayload,
  mapConnectionStateToCredentialStatus,
  mapCredoStateToCredentialStatus,
  type ConnectionStateChangedWebhookPayload,
  type CredentialStateChangedWebhookPayload,
} from "@/lib/credentials/statusMapping";

export { derivedConnectionEventId, derivedCredentialEventId, mapCredoStateToCredentialStatus };

export const ACTIVE_CREDENTIAL_STATUSES = [
  CredentialIssuanceStatus.OFFER_SENT,
  CredentialIssuanceStatus.OFFER_RECEIVED,
  CredentialIssuanceStatus.ACCEPTED,
  CredentialIssuanceStatus.ISSUED,
] as const;

function isCredentialIssuanceStatus(value: string): value is CredentialIssuanceStatus {
  return Object.values(CredentialIssuanceStatus).includes(value as CredentialIssuanceStatus);
}

export function toPublicCredentialStatus(status?: CredentialIssuanceStatus | null): CredentialLifecycleState {
  return status && isCredentialIssuanceStatus(status) ? status : "NOT_ISSUED";
}

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
  issuance?: Pick<CredentialIssuance, "id" | "status" | "credentialDefinitionId" | "credentialExchangeId">,
): StudentRecord {
  return {
    ...student,
    credential: {
      ...student.credential,
      id: issuance?.id ?? student.credential.id,
      lifecycleState: toPublicCredentialStatus(issuance?.status),
    },
  };
}

export async function overlayCredentialStatuses(students: StudentRecord[]): Promise<StudentRecord[]> {
  if (students.length === 0) {
    return students;
  }

  const issuances = await prisma.credentialIssuance.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: {
      studentId: { in: students.map((student) => student.profile.id) },
    },
  });
  const issuancesByStudent = latestIssuanceByStudent(issuances);

  return students.map((student) => overlayCredentialStatus(student, issuancesByStudent.get(student.profile.id)));
}

export async function overlayCredentialStatusForStudent(student: StudentRecord): Promise<StudentRecord> {
  const issuance = await prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: { studentId: student.profile.id },
  });

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
  outOfBandId?: string;
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
      outOfBandId: params.outOfBandId,
      status: params.wasDelivered ? CredentialIssuanceStatus.OFFER_SENT : CredentialIssuanceStatus.FAILED,
      studentId: params.studentId,
    },
  });
}

function shouldApplyStatus(
  mappedStatus: CredentialIssuanceStatus,
  currentStatus?: CredentialIssuanceStatus | null,
) {
  if (mappedStatus === CredentialIssuanceStatus.OFFER_SENT) {
    return !currentStatus || currentStatus === CredentialIssuanceStatus.OFFER_SENT;
  }

  if (mappedStatus === CredentialIssuanceStatus.OFFER_RECEIVED) {
    return currentStatus === CredentialIssuanceStatus.OFFER_SENT;
  }

  return true;
}

export async function reconcileCredentialEventLogs(credentialExchangeId: string, outOfBandId?: string) {
  const issuance = await prisma.credentialIssuance.findUnique({ where: { credentialExchangeId } });
  if (!issuance) {
    return;
  }

  const events = await prisma.credentialEventLog.findMany({
    orderBy: { occurredAt: "asc" },
    where: {
      OR: [
        { credentialExchangeId },
        ...(outOfBandId ? [{ outOfBandId }] : []),
      ],
    },
  });
  let status = issuance.status;
  let issuedAt = issuance.issuedAt;
  let connectionId = issuance.connectionId;

  for (const event of events) {
    const mapped =
      event.type === CredentialEventType.CONNECTION_STATE_CHANGED
        ? mapConnectionStateToCredentialStatus({
            connectionId: event.connectionId ?? "",
            outOfBandId: event.outOfBandId ?? undefined,
            previousState: event.previousState,
            state: event.state,
            timestamp: event.occurredAt.toISOString(),
            type: "connection.stateChanged",
          })
        : mapCredoStateToCredentialStatus(event.state, status);
    if (!mapped || !shouldApplyStatus(mapped, status)) continue;
    status = mapped;
    connectionId = event.connectionId ?? connectionId;
    if (mapped === CredentialIssuanceStatus.ISSUED) {
      issuedAt = event.occurredAt;
    }
  }

  if (
    status !== issuance.status ||
    issuedAt?.getTime() !== issuance.issuedAt?.getTime() ||
    connectionId !== issuance.connectionId
  ) {
    await prisma.credentialIssuance.update({
      data: { connectionId, issuedAt, status },
      where: { id: issuance.id },
    });
  }
}

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
      await prisma.credentialIssuance.update({
        data: {
          connectionId: payload.connectionId ?? existingIssuance.connectionId,
          issuedAt: mappedStatus === CredentialIssuanceStatus.ISSUED ? occurredAt : existingIssuance.issuedAt,
          status: mappedStatus,
        },
        where: { id: existingIssuance.id },
      });
    }
  }

  return { duplicate: false, status: mappedStatus };
}

export async function recordConnectionStateChangedEvent(payload: ConnectionStateChangedWebhookPayload) {
  const mappedStatus = mapConnectionStateToCredentialStatus(payload);
  if (!mappedStatus) {
    return { duplicate: false, ignored: true };
  }

  const eventId = payload.eventId ?? derivedConnectionEventId(payload);
  const occurredAt = new Date(payload.timestamp);
  const existingIssuance = payload.outOfBandId
    ? await prisma.credentialIssuance.findUnique({ where: { outOfBandId: payload.outOfBandId } })
    : null;

  const createResult = await prisma.credentialEventLog.createMany({
    data: {
      connectionId: payload.connectionId,
      credentialDefinitionId: existingIssuance?.credentialDefinitionId,
      credentialExchangeId: existingIssuance?.credentialExchangeId,
      eventId,
      occurredAt,
      outOfBandId: payload.outOfBandId,
      payload,
      previousState: payload.previousState ?? null,
      state: payload.state,
      status: mappedStatus,
      type: CredentialEventType.CONNECTION_STATE_CHANGED,
    },
    skipDuplicates: true,
  });

  if (createResult.count === 0) {
    return { duplicate: true, status: existingIssuance?.status };
  }

  if (existingIssuance && shouldApplyStatus(mappedStatus, existingIssuance.status)) {
    await prisma.credentialIssuance.update({
      data: {
        connectionId: payload.connectionId,
        status: mappedStatus,
      },
      where: { id: existingIssuance.id },
    });
  }

  return { duplicate: false, status: mappedStatus };
}

export async function getLatestCredentialIssuanceForStudent(studentId: string) {
  return prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: { studentId },
  });
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
  const [pendingIssuance, issuedCredentials, failedCredentials, activeBatchJobs] = await Promise.all([
    prisma.credentialIssuance.count({
      where: {
        status: {
          in: [
            CredentialIssuanceStatus.OFFER_SENT,
            CredentialIssuanceStatus.OFFER_RECEIVED,
            CredentialIssuanceStatus.ACCEPTED,
          ],
        },
      },
    }),
    prisma.credentialIssuance.count({ where: { status: CredentialIssuanceStatus.ISSUED } }),
    prisma.credentialIssuance.count({ where: { status: CredentialIssuanceStatus.FAILED } }),
    prisma.batchIssuanceRun.count({
      where: { status: { in: [BatchIssuanceRunStatus.QUEUED, BatchIssuanceRunStatus.PROCESSING] } },
    }),
  ]);

  return {
    activeBatchJobs,
    auditEventsToday: 0,
    failedCredentials,
    issuedCredentials,
    pendingIssuance,
    vendorsPendingApproval: 0,
  };
}

export async function getRecentCredentialActivityEvents(limit = 10): Promise<CredentialActivityEvent[]> {
  const events = await prisma.credentialEventLog.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  return events.map((event: CredentialEventLog) => ({
    connectionId: event.connectionId ?? undefined,
    credentialExchangeId: event.credentialExchangeId ?? undefined,
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    outOfBandId: event.outOfBandId ?? undefined,
    previousState: event.previousState ?? undefined,
    state: event.state,
    status: event.status ?? undefined,
  }));
}
