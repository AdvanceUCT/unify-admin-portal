import "server-only";

import { mockBatchIssuancePreview } from "@/lib/api/mockData";
import { getMockAdminState, recordBatchIssuanceResult } from "@/lib/api/mockActivationStore";
import type { ActivationDelivery, BatchIssuanceResult, StudentRecord } from "@/lib/api/types";
import { createBatchActivationLinks } from "@/lib/agentClient";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import {
  isStudentRecordEligibleForCredentialIssuance,
  selectStudentRecordsForCredentialIssuance,
} from "@/lib/student-records/simulatedUniversityRecords";

const DEFAULT_YEAR = "2026";

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

function attributesForStudent(student: StudentRecord, schemaAttributes: string[]) {
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

async function getActiveCredentialDefinition() {
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
): Promise<BatchIssuanceResult> {
  const activeSchema = await getActiveCredentialDefinition();

  const agentResult = await createBatchActivationLinks({
    credentialDefinitionId: activeSchema.credentialDefinitionId,
    students: studentsForIssuance.map((student) => ({
      attributes: attributesForStudent(student, activeSchema.schemaAttributes),
      email: student.profile.email,
      externalId: student.profile.id,
      walletId: `wallet-${student.profile.id}`,
    })),
  });
  const deliveries: ActivationDelivery[] = [];
  const failures = [...agentResult.failures];

  for (const offer of agentResult.offers) {
    const student = studentsForIssuance.find((candidate) => candidate.profile.id === offer.externalId);
    const emailDelivery = await emailDeliveryForOffer(student, offer);

    if (emailDelivery.status === "Failed") {
      failures.push({
        email: offer.email,
        externalId: offer.externalId,
        message: emailDelivery.failureReason,
      });
    }

    deliveries.push({
      activationId: offer.activationId,
      activationUrl: offer.activationUrl,
      batchId: mockBatchIssuancePreview.batchId,
      channel: "activation-link",
      credentialExchangeId: offer.credentialExchangeId,
      credentialId: student?.credential.id ?? offer.externalId ?? offer.activationId,
      deliveredAt: emailDelivery.status === "Delivered" ? now.toISOString() : undefined,
      email: offer.email,
      emailStatus: emailDelivery.status === "Delivered" ? "Sent" : "Failed",
      expiresAt: deliveryExpiryFrom(offer.expiresAt),
      failureReason: emailDelivery.status === "Failed" ? emailDelivery.failureReason : undefined,
      id: `activation-delivery-${offer.activationId}`,
      status: emailDelivery.status,
      studentId: offer.externalId ?? offer.studentId,
    });
  }

  const result: BatchIssuanceResult = {
    activationDeliveries: deliveries,
    batchId: mockBatchIssuancePreview.batchId,
    cohortId: mockBatchIssuancePreview.cohortId,
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

export async function queueRealBatchIssuance(now = new Date()): Promise<BatchIssuanceResult> {
  const studentsForIssuance = selectStudentRecordsForCredentialIssuance(getMockAdminState().students, {
    cohortId: mockBatchIssuancePreview.cohortId,
    limit: mockBatchIssuancePreview.requestedCount,
  });

  if (studentsForIssuance.length === 0) {
    throw new Error("No eligible simulated students are available for credential issuance.");
  }

  return issueStudentActivationLinks(studentsForIssuance, now, studentsForIssuance.length);
}

export async function queueRealStudentIssuance(
  studentId: string,
  now = new Date(),
): Promise<BatchIssuanceResult> {
  const student = getMockAdminState().students.find((candidate) => candidate.profile.id === studentId);

  if (!student) {
    throw new StudentIssuanceError("Student record was not found.", 404);
  }

  if (!isStudentRecordEligibleForCredentialIssuance(student)) {
    throw new StudentIssuanceError(
      "Student credential is not ready for issuance in its current lifecycle state.",
      409,
    );
  }

  return issueStudentActivationLinks([student], now, 1);
}
