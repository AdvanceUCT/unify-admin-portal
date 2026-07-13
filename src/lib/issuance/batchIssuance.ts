import "server-only";

import { CredentialDeliveryStatus } from "@/generated/prisma/enums";
import { mockBatchIssuancePreview } from "@/lib/api/mockData";
import { recordBatchIssuanceResult } from "@/lib/api/mockActivationStore";
import { toPublicWalletActivationLink } from "@/lib/api/activationLinks";
import type {
  ActivationDelivery,
  BatchIssuanceResult,
  BatchIssuanceSelection,
  CredentialLifecycleState,
  StudentRecord,
} from "@/lib/api/types";
import { createBatchActivationLinks } from "@/lib/agentClient";
import { recordCredentialOfferSentAudit } from "@/lib/credentials/audit";
import {
  assertCredentialIssuanceAllowed,
  createCredentialIssuanceFromOffer,
  overlayCredentialStatusForStudent,
  reconcileCredentialEventLogs,
} from "@/lib/credentials/status";
import { getAllStudents, getStudentById } from "@/lib/students/repository";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import {
  isStudentRecordEligibleForCredentialIssuance,
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
} from "@/lib/student-records/simulatedUniversityRecords";

const DEFAULT_YEAR = "2026";
const MAX_BATCH_ISSUANCE_LIMIT = 100_000;
const credentialStatuses = new Set<CredentialLifecycleState>([
  "ACCEPTED",
  "ACTIVE",
  "EXPIRED",
  "FAILED",
  "LEGACY_NON_REVOCABLE",
  "NOT_ISSUED",
  "OFFER_SENT",
  "REVOKED",
  "SUSPENDED",
]);

/**
 * Custom error for failed student issuance requests.
 * Includes an HTTP status code alongside the message.
 */
export class StudentIssuanceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentIssuanceError";
    this.status = status;
  }
}

/**
 * Looks up the value for a credential attribute by name from the student's data.
 * Fixed platform/simulated fields are checked first; anything else falls back to
 * the student's stored `attributes` bag (schema fields sourced from CSV import),
 * so per-university custom schema attributes resolve without code changes.
 * Throws if no value is found anywhere, so schema mismatches are caught early
 * instead of silently producing empty credentials.
 *
 * @param student - The student to read data from.
 * @param attributeName - The schema attribute name to look up.
 * @returns The string value for that attribute.
 * @throws If no value exists for the given attribute name.
 */
function attributeValue(student: StudentRecord, attributeName: string): string {
  const values: Record<string, string | undefined> = {
    email: student.profile.email,
    expiresAt: student.credential.expiresAt,
    faculty: student.credential.faculty,
    firstName: student.profile.firstName,
    fullName: student.credential.holderName,
    institution: student.profile.institution,
    issuedAt: new Date().toISOString(),
    lastName: student.profile.lastName,
    programme: student.credential.programme,
    studentId: student.credential.studentNumber,
    studentNumber: student.credential.studentNumber,
    validFrom: student.credential.validFrom,
    year: DEFAULT_YEAR,
  };
  const value = values[attributeName] ?? student.credential.attributes?.[attributeName];

  if (!value) {
    throw new Error(`No student value is available for schema attribute "${attributeName}".`);
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

/**
 * Creates a batch ID from the current time by stripping separators from the ISO
 * string and keeping only the first 14 digits, e.g. `batch-20260118120000`.
 */
function batchIdFrom(now: Date) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `batch-${timestamp}`;
}

function optionalTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Parses and validates the batch filter input. Missing fields fall back to
 * simulated cohort defaults. Throws if a filter value or limit is invalid.
 *
 * @param value - Raw filter input from a form or API body.
 * @returns A validated `BatchIssuanceSelection` object.
 * @throws {StudentIssuanceError} If a filter value or the limit is out of range.
 */
export function parseBatchIssuanceSelection(value: unknown): BatchIssuanceSelection {
  if (!value || typeof value !== "object") {
    return { cohortId: SIMULATED_STUDENT_COHORT_ID };
  }

  const record = value as Record<string, unknown>;
  const cohortId = optionalTrimmedString(record.cohortId) ?? SIMULATED_STUDENT_COHORT_ID;
  const faculty = optionalTrimmedString(record.faculty);
  const programme = optionalTrimmedString(record.programme);
  const credentialStatus = optionalTrimmedString(record.credentialStatus);
  const limit = record.limit === undefined || record.limit === "" ? undefined : Number(record.limit);

  if (credentialStatus && !credentialStatuses.has(credentialStatus as CredentialLifecycleState)) {
    throw new StudentIssuanceError("Credential status filter is not valid.", 400);
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_ISSUANCE_LIMIT)) {
    throw new StudentIssuanceError(
      `Batch issuance limit must be an integer between 1 and ${MAX_BATCH_ISSUANCE_LIMIT}.`,
      400,
    );
  }

  return {
    cohortId,
    credentialStatus: credentialStatus as CredentialLifecycleState | undefined,
    faculty,
    limit,
    programme,
  };
}

/**
 * Tries to send the activation email for an offer. Returns a success or failure
 * result instead of throwing, so one bad email doesn't stop the rest of the batch.
 *
 * @param student - Used to get the student's name for the email.
 * @param offer - The offer containing the activation URL, email address, and expiry.
 * @returns `{ status: "Delivered" }` on success, or `{ status: "Failed", failureReason }` on error.
 */
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

/**
 * Gets the active credential definition ID and schema attributes for the university.
 * Throws if the university profile or an active credential schema hasn't been set up yet.
 *
 * @returns The active `credentialDefinitionId` and `schemaAttributes`.
 * @throws If no university profile or active credential schema is found.
 */
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
    revocationRegistryDefinitionId: activeSchema.revocationRegistryDefinitionId ?? undefined,
    schemaAttributes: activeSchema.schemaAttributes,
  };
}

/**
 * The core issuance pipeline. For each student it:
 * 1. Checks no active issuance already exists (throws 409 if one does).
 * 2. Calls the agent to create activation links in bulk.
 * 3. Sends the activation email and records the delivery outcome.
 * 4. Saves a `CredentialIssuance` record and syncs event logs.
 * 5. Writes an audit log entry.
 *
 * Per-student agent failures are collected and returned rather than stopping the batch.
 *
 * @param studentsForIssuance - Pre-filtered list of eligible students.
 * @param now - Used for the batch ID and queued-at timestamp.
 * @param requestedCount - How many students were originally requested.
 * @param selection - The filters used to select students.
 * @param actorId - Who triggered the issuance, if anyone.
 * @param includeBatchIdInAudit - Whether to include the batch ID in each audit entry.
 * @returns A `BatchIssuanceResult` with deliveries, failures, and counts.
 * @throws {StudentIssuanceError} If a student already has an active issuance (409).
 */
async function issueStudentActivationLinks(
  studentsForIssuance: StudentRecord[],
  now: Date,
  requestedCount: number,
  selection: BatchIssuanceSelection = {},
  actorId?: string | null,
  includeBatchIdInAudit = false,
): Promise<BatchIssuanceResult> {
  const activeSchema = await getActiveCredentialDefinition();
  const batchId = batchIdFrom(now);

  try {
    await Promise.all(
      studentsForIssuance.map((student) =>
      assertCredentialIssuanceAllowed({
        credentialDefinitionId: activeSchema.credentialDefinitionId,
        studentId: student.credential.studentNumber,
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
    ...(activeSchema.revocationRegistryDefinitionId
      ? { revocationRegistryDefinitionId: activeSchema.revocationRegistryDefinitionId }
      : {}),
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
    const persistedStudentId = student?.credential.studentNumber ?? offer.externalId ?? offer.activationId;
    const publicActivationUrl = toPublicWalletActivationLink(offer.activationUrl);
    const publicOffer = { ...offer, activationUrl: publicActivationUrl };
    const emailDelivery = await emailDeliveryForOffer(student, publicOffer);
    const issuance = await createCredentialIssuanceFromOffer({
      activationId: offer.activationId,
      activationUrl: publicActivationUrl,
      credentialDefinitionId: activeSchema.credentialDefinitionId,
      credentialExchangeId: offer.credentialExchangeId,
      credentialRevocationId: offer.credentialRevocationId,
      email: offer.email,
      expiresAt: offer.expiresAt,
      failureReason: emailDelivery.status === "Failed" ? emailDelivery.failureReason : undefined,
      revocationRegistryDefinitionId: offer.revocationRegistryDefinitionId,
      studentId: persistedStudentId,
      wasDelivered: emailDelivery.status === "Delivered",
    });
    await reconcileCredentialEventLogs(offer.credentialExchangeId);

    await recordCredentialOfferSentAudit({
      actorId,
      batchId: includeBatchIdInAudit ? batchId : null,
      credentialDefinitionId: activeSchema.credentialDefinitionId,
      credentialExchangeId: offer.credentialExchangeId,
      credentialIssuanceId: issuance.id,
      deliveryStatus:
        emailDelivery.status === "Delivered" ? CredentialDeliveryStatus.DELIVERED : CredentialDeliveryStatus.FAILED,
      failureReason: emailDelivery.status === "Failed" ? emailDelivery.failureReason : undefined,
      studentId: persistedStudentId,
    });

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

/**
 * Issues credentials to a filtered batch of students.
 * The first argument can be a `Date` to override the current time, or a
 * `BatchIssuanceSelection` filter object to scope which students are included.
 *
 * @param selectionInputOrNow - Filter criteria or a `Date` to override the current time.
 * @param requestedNow - Current time, used when the first arg is a selection object.
 * @param actorId - Who triggered the batch, if anyone.
 * @returns A `BatchIssuanceResult` for the queued batch.
 */
export async function queueRealBatchIssuance(
  selectionInputOrNow: BatchIssuanceSelection | Date = {},
  requestedNow = new Date(),
  actorId?: string | null,
): Promise<BatchIssuanceResult> {
  const now = selectionInputOrNow instanceof Date ? selectionInputOrNow : requestedNow;
  const selection = selectionInputOrNow instanceof Date ? {} : parseBatchIssuanceSelection(selectionInputOrNow);
  const studentsForIssuance = selectStudentRecordsForCredentialIssuance(await getAllStudents(), {
    ...selection,
    limit: selection.limit ?? MAX_BATCH_ISSUANCE_LIMIT,
  });

  return issueStudentActivationLinks(studentsForIssuance, now, studentsForIssuance.length, selection, actorId, true);
}

/**
 * Issues a credential to a single student. Checks the student exists and is
 * eligible before running the issuance pipeline. Used for one-off issuance
 * outside of a batch run.
 *
 * @param studentId - The student to issue to.
 * @param now - Current time, defaults to `new Date()`.
 * @param actorId - Who triggered the issuance, if anyone.
 * @returns A `BatchIssuanceResult` scoped to the single student.
 * @throws {StudentIssuanceError} If the student is not found (404) or not eligible (409).
 */
export async function queueRealStudentIssuance(
  studentId: string,
  now = new Date(),
  actorId?: string | null,
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

  return issueStudentActivationLinks([studentWithCredentialStatus], now, 1, {}, actorId, false);
}
