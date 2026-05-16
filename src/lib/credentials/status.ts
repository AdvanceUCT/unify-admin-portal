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
  derivedCredentialEventId,
  mapCredoStateToCredentialStatus,
  type CredentialStateChangedWebhookPayload,
} from "@/lib/credentials/statusMapping";

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

function latestIssuanceByStudent(issuances: CredentialIssuance[]) {
  const byStudent = new Map<string, CredentialIssuance>();

  for (const issuance of issuances) {
    if (!byStudent.has(issuance.studentExternalId)) {
      byStudent.set(issuance.studentExternalId, issuance);
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
      studentExternalId: { in: students.map((student) => student.profile.id) },
    },
  });
  const issuancesByStudent = latestIssuanceByStudent(issuances);

  return students.map((student) => overlayCredentialStatus(student, issuancesByStudent.get(student.profile.id)));
}

export async function overlayCredentialStatusForStudent(student: StudentRecord): Promise<StudentRecord> {
  const issuance = await prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: { studentExternalId: student.profile.id },
  });

  return overlayCredentialStatus(student, issuance ?? undefined);
}

export async function findActiveCredentialIssuance(params: {
  credentialDefinitionId: string;
  studentExternalId: string;
}) {
  return prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: {
      credentialDefinitionId: params.credentialDefinitionId,
      status: { in: [...ACTIVE_CREDENTIAL_STATUSES] },
      studentExternalId: params.studentExternalId,
    },
  });
}

export async function assertCredentialIssuanceAllowed(params: {
  credentialDefinitionId: string;
  studentExternalId: string;
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
  batchItemId?: string;
  credentialDefinitionId: string;
  credentialExchangeId: string;
  email?: string;
  expiresAt?: string;
  failureReason?: string;
  studentExternalId: string;
  wasDelivered: boolean;
}) {
  return prisma.credentialIssuance.create({
    data: {
      activationId: params.activationId,
      activationExpiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
      activationUrl: params.activationUrl,
      batchItemId: params.batchItemId,
      credentialDefinitionId: params.credentialDefinitionId,
      credentialExchangeId: params.credentialExchangeId,
      deliveryStatus: params.wasDelivered ? CredentialDeliveryStatus.DELIVERED : CredentialDeliveryStatus.FAILED,
      email: params.email,
      failureReason: params.failureReason,
      status: params.wasDelivered ? CredentialIssuanceStatus.OFFER_SENT : CredentialIssuanceStatus.FAILED,
      studentExternalId: params.studentExternalId,
    },
  });
}

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
    if (!mapped) continue;
    status = mapped;
    if (mapped === CredentialIssuanceStatus.ISSUED) {
      issuedAt = event.occurredAt;
    }
  }

  if (status !== issuance.status || issuedAt?.getTime() !== issuance.issuedAt?.getTime()) {
    await prisma.credentialIssuance.update({
      data: { issuedAt, status },
      where: { id: issuance.id },
    });
  }
}

export async function recordCredentialStateChangedEvent(payload: CredentialStateChangedWebhookPayload) {
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
    await prisma.credentialIssuance.update({
      data: {
        issuedAt: mappedStatus === CredentialIssuanceStatus.ISSUED ? occurredAt : existingIssuance.issuedAt,
        status: mappedStatus,
      },
      where: { id: existingIssuance.id },
    });
  }

  return { duplicate: false, status: mappedStatus };
}

export async function getLatestCredentialIssuanceForStudent(studentExternalId: string) {
  return prisma.credentialIssuance.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    where: { studentExternalId },
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
    batchId: issuance.batchItemId ?? "individual",
    channel: "activation-link" as const,
    credentialExchangeId: issuance.credentialExchangeId ?? undefined,
    credentialId: issuance.id,
    deliveredAt: issuance.deliveryStatus === CredentialDeliveryStatus.DELIVERED ? issuance.createdAt.toISOString() : undefined,
    email: issuance.email ?? undefined,
    expiresAt: issuance.activationExpiresAt?.toISOString() ?? issuance.createdAt.toISOString(),
    failureReason: issuance.failureReason ?? undefined,
    id: `activation-delivery-${issuance.activationId ?? issuance.id}`,
    status: issuance.deliveryStatus === CredentialDeliveryStatus.FAILED ? "Failed" as const : "Delivered" as const,
    studentId: issuance.studentExternalId,
  };
}

export async function getDashboardCredentialSummary(): Promise<DashboardSummary> {
  const [pendingIssuance, issuedCredentials, failedCredentials, activeBatchJobs] = await Promise.all([
    prisma.credentialIssuance.count({
      where: { status: { in: [CredentialIssuanceStatus.OFFER_SENT, CredentialIssuanceStatus.ACCEPTED] } },
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
    credentialExchangeId: event.credentialExchangeId,
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    previousState: event.previousState ?? undefined,
    state: event.state,
    status: event.status ?? undefined,
  }));
}
