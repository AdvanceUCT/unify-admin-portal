import "server-only";

import { mockBatchIssuancePreview } from "@/lib/api/mockData";
import { recordBatchIssuanceResult } from "@/lib/api/mockActivationStore";
import { toPublicWalletActivationLink } from "@/lib/api/activationLinks";
import type {
  ActivationDelivery,
  BatchIssuanceResult,
  BatchIssuanceSelection,
  CredentialLifecycleState,
  StudentCredential,
  StudentRecord,
} from "@/lib/api/types";
import { createBatchActivationLinks } from "@/lib/agentClient";
import {
  assertCredentialIssuanceAllowed,
  createCredentialIssuanceFromOffer,
  overlayCredentialStatuses,
  overlayCredentialStatusForStudent,
  reconcileCredentialEventLogs,
} from "@/lib/credentials/status";
import { getAllStudents, getStudentById } from "@/lib/db/store";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import {
  isStudentRecordEligibleForCredentialIssuance,
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
  SIMULATED_STUDENT_RECORD_COUNT,
} from "@/lib/student-records/simulatedUniversityRecords";

const DEFAULT_YEAR = "2026";
const credentialStatuses = new Set<CredentialLifecycleState>([
  "ACCEPTED",
  "FAILED",
  "ISSUED",
  "NOT_ISSUED",
  "OFFER_SENT",
  "REVOKED",
]);
const enrolmentStatuses = new Set<StudentCredential["enrolmentStatus"]>([
  "Graduated",
  "Registered",
  "Suspended",
  "Withdrawn",
]);

export class StudentIssuanceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentIssuanceError";
    this.status = status;
  }
}

function attributeValue(student: StudentRecord, attributeName: string): string {
  const values: Record<string, string | undefined> = {
    email: student.profile.email,
    enrolmentStatus: student.credential.enrolmentStatus,
    expiresAt: student.credential.expiresAt,
    faculty: student.credential.faculty,
    firstName: student.profile.firstName,
    fullName: student.credential.holderName,
    institution: student.profile.institution,
    issuedAt: new Date().toISOString(),
    lastName: student.profile.lastName,
    programme: student.credential.programme,
    studentId: student.profile.id,
    studentNumber: student.credential.studentNumber,
    validFrom: student.credential.validFrom,
    year: DEFAULT_YEAR,
  };
  const value = values[attributeName];

  if (!value) {
    throw new Error(`No simulated student value is available for schema attribute "${attributeName}".`);
  }

  return value;
}

export function attributesForStudent(student: StudentRecord, schemaAttributes: string[]) {
  return schemaAttributes.map((name) => ({
    name,
    value: attributeValue(student, name),
  }));
}

function deliveryExpiryFrom(expiresAt: string) {
  return new Date(expiresAt).toISOString();
}

function fullName(student: StudentRecord) {
  return `${student.profile.firstName} ${student.profile.lastName}`;
}

function batchIdFrom(now: Date) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `batch-${timestamp}`;
}

function optionalTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseBatchIssuanceSelection(value: unknown): BatchIssuanceSelection {
  if (!value || typeof value !== "object") {
    return { cohortId: SIMULATED_STUDENT_COHORT_ID };
  }

  const record = value as Record<string, unknown>;
  const cohortId = optionalTrimmedString(record.cohortId) ?? SIMULATED_STUDENT_COHORT_ID;
  const faculty = optionalTrimmedString(record.faculty);
  const programme = optionalTrimmedString(record.programme);
  const credentialStatus = optionalTrimmedString(record.credentialStatus);
  const enrolmentStatus = optionalTrimmedString(record.enrolmentStatus);
  const limit = record.limit === undefined || record.limit === "" ? undefined : Number(record.limit);

  if (credentialStatus && !credentialStatuses.has(credentialStatus as CredentialLifecycleState)) {
    throw new StudentIssuanceError("Credential status filter is not valid.", 400);
  }

  if (enrolmentStatus && !enrolmentStatuses.has(enrolmentStatus as StudentCredential["enrolmentStatus"])) {
    throw new StudentIssuanceError("Enrolment status filter is not valid.", 400);
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > SIMULATED_STUDENT_RECORD_COUNT)) {
    throw new StudentIssuanceError(
      `Batch issuance limit must be an integer between 1 and ${SIMULATED_STUDENT_RECORD_COUNT}.`,
      400,
    );
  }

  return {
    cohortId,
    credentialStatus: credentialStatus as CredentialLifecycleState | undefined,
    enrolmentStatus: enrolmentStatus as StudentCredential["enrolmentStatus"] | undefined,
    faculty,
    limit,
    programme,
  };
}

async function emailDeliveryForOffer(
  student: StudentRecord | undefined,
  offer: {
    activationUrl: string;
    email?: string;
    expiresAt: string;
  },
) {
  if (!student || !offer.email) {
    return {
      failureReason: "Student email address was not available for credential activation delivery.",
      status: "Failed" as const,
    };
  }

  try {
    await sendCredentialActivationEmail({
      activationUrl: offer.activationUrl,
      expiresAt: offer.expiresAt,
      studentName: fullName(student),
      to: offer.email,
    });
    return { status: "Delivered" as const };
  } catch (error) {
    return {
      failureReason: error instanceof Error ? error.message : String(error),
      status: "Failed" as const,
    };
  }
}

export async function getActiveCredentialDefinition() {
  const profile = await getUniversityProfile();

  if (!profile) {
    throw new Error("University profile has not been configured.");
  }

  const activeSchema = await getActiveCredentialSchema(profile.id);

  if (!activeSchema?.credentialDefinitionId) {
    throw new Error("Active credential schema with credential definition ID was not found.");
  }

  return {
    credentialDefinitionId: activeSchema.credentialDefinitionId,
    schemaAttributes: activeSchema.schemaAttributes,
  };
}

async function issueStudentActivationLinks(
  studentsForIssuance: StudentRecord[],
  now: Date,
  requestedCount: number,
  selection: BatchIssuanceSelection = {},
): Promise<BatchIssuanceResult> {
  const activeSchema = await getActiveCredentialDefinition();
  const batchId = batchIdFrom(now);

  try {
    await Promise.all(
      studentsForIssuance.map((student) =>
      assertCredentialIssuanceAllowed({
        credentialDefinitionId: activeSchema.credentialDefinitionId,
        studentId: student.profile.id,
      }),
      ),
    );
  } catch (error) {
    throw new StudentIssuanceError(
      error instanceof Error ? error.message : "Student already has an active credential issuance.",
      409,
    );
  }

  const agentResult = await createBatchActivationLinks({
    credentialDefinitionId: activeSchema.credentialDefinitionId,
    students: studentsForIssuance.map((student) => ({
      attributes: attributesForStudent(student, activeSchema.schemaAttributes),
      email: student.profile.email,
      externalId: student.profile.id,
    })),
  });
  const deliveries: ActivationDelivery[] = [];
  const failures = [...agentResult.failures];

  for (const offer of agentResult.offers) {
    const student = studentsForIssuance.find((candidate) => candidate.profile.id === offer.externalId);
    const publicActivationUrl = toPublicWalletActivationLink(offer.activationUrl);
    const publicOffer = { ...offer, activationUrl: publicActivationUrl };
    const emailDelivery = await emailDeliveryForOffer(student, publicOffer);
    const issuance = await createCredentialIssuanceFromOffer({
      activationId: offer.activationId,
      activationUrl: publicActivationUrl,
      credentialDefinitionId: activeSchema.credentialDefinitionId,
      credentialExchangeId: offer.credentialExchangeId,
      email: offer.email,
      expiresAt: offer.expiresAt,
      failureReason: emailDelivery.status === "Failed" ? emailDelivery.failureReason : undefined,
      studentId: student?.profile.id ?? offer.externalId ?? offer.activationId,
      wasDelivered: emailDelivery.status === "Delivered",
    });
    await reconcileCredentialEventLogs(offer.credentialExchangeId);

    if (emailDelivery.status === "Failed") {
      failures.push({
        email: offer.email,
        externalId: offer.externalId,
        message: emailDelivery.failureReason,
      });
    }

    deliveries.push({
      activationId: offer.activationId,
      activationUrl: publicActivationUrl,
      batchId,
      channel: "activation-link",
      credentialExchangeId: offer.credentialExchangeId,
      credentialId: issuance.id,
      deliveredAt: emailDelivery.status === "Delivered" ? now.toISOString() : undefined,
      email: offer.email,
      emailStatus: emailDelivery.status === "Delivered" ? "Sent" : "Failed",
      expiresAt: deliveryExpiryFrom(offer.expiresAt),
      failureReason: emailDelivery.status === "Failed" ? emailDelivery.failureReason : undefined,
      id: `activation-delivery-${offer.activationId}`,
      status: emailDelivery.status,
      studentId: student?.profile.id ?? offer.externalId ?? offer.activationId,
    });
  }

  const result: BatchIssuanceResult = {
    activationDeliveries: deliveries,
    batchId,
    cohortId: selection.cohortId ?? mockBatchIssuancePreview.cohortId,
    failures: failures.length > 0 ? failures : undefined,
    issuedCredentialIds: deliveries
      .filter((delivery) => delivery.status === "Delivered")
      .map((delivery) => delivery.credentialId),
    queuedAt: now.toISOString(),
    requestedCount,
    status: "Queued",
  };

  recordBatchIssuanceResult(result, now);

  return result;
}

export async function queueRealBatchIssuance(
  selectionInputOrNow?: BatchIssuanceSelection | Date,
  requestedNow = new Date(),
): Promise<BatchIssuanceResult> {
  const now = selectionInputOrNow instanceof Date ? selectionInputOrNow : requestedNow;
  const selectionInput = selectionInputOrNow instanceof Date ? undefined : selectionInputOrNow;
  const selection = parseBatchIssuanceSelection(selectionInput);
  const studentsForIssuance = selectStudentRecordsForCredentialIssuance(
    await overlayCredentialStatuses(await getAllStudents()),
    selection,
  );

  if (studentsForIssuance.length === 0) {
    throw new StudentIssuanceError("No eligible simulated students match the selected batch filters.", 409);
  }

  return issueStudentActivationLinks(studentsForIssuance, now, studentsForIssuance.length, selection);
}

export async function queueRealStudentIssuance(
  studentId: string,
  now = new Date(),
): Promise<BatchIssuanceResult> {
  const student = await getStudentById(studentId);

  if (!student) {
    throw new StudentIssuanceError("Student record was not found.", 404);
  }

  const studentWithCredentialStatus = await overlayCredentialStatusForStudent(student);

  if (!isStudentRecordEligibleForCredentialIssuance(studentWithCredentialStatus)) {
    throw new StudentIssuanceError(
      "Student credential is not ready for issuance in its current lifecycle state.",
      409,
    );
  }

  return issueStudentActivationLinks([studentWithCredentialStatus], now, 1);
}
