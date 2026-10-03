/**
 * @fileoverview Selects eligible students and queues credential offers while retaining per-item outcomes.
 * @module lib/issuance/batchIssuance
 */

import "server-only";

import type { CredentialIssuance } from "@/generated/prisma/client";
import {
  prepareOffer,
  deliverPreparedOffer,
} from "@/lib/credentials/preparedOffer";
import { currentValidityPolicy } from "@/lib/credentials/validityPolicy";
import {
  issuancePeriod,
  parseRenewalOptions,
  type RenewalOptions,
} from "@/lib/credentials/academicPeriod";
import type {
  BatchIssuanceResult,
  BatchIssuanceSelection,
  CredentialLifecycleState,
  StudentRecord,
} from "@/lib/api/types";
import { mapWithConcurrency } from "@/lib/async/mapWithConcurrency";
import { env } from "@/lib/config/env";
import {
  overlayCredentialStatus,
  overlayCredentialStatusForStudent,
} from "@/lib/credentials/status";
import { getAllStudents, getStudentById } from "@/lib/students/repository";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import { prisma } from "@/lib/db/prisma";
import {
  isStudentRecordEligibleForCredentialIssuance,
  selectStudentRecordsForCredentialIssuance,
  SIMULATED_STUDENT_COHORT_ID,
} from "@/lib/student-records/simulatedUniversityRecords";

export const MAX_BATCH_ISSUANCE_LIMIT = 100;
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

export type CredentialValidityWindow = {
  expiresAt: Date;
  validFrom: Date;
};

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
function attributeValue(
  student: StudentRecord,
  attributeName: string,
  validityWindow: CredentialValidityWindow,
): string {
  const values: Record<string, string | undefined> = {
    email: student.profile.email,
    expiresAt: validityWindow.expiresAt.toISOString(),
    faculty: student.credential.faculty,
    firstName: student.profile.firstName,
    fullName: student.credential.holderName,
    institution: student.profile.institution,
    issuedAt: validityWindow.validFrom.toISOString(),
    lastName: student.profile.lastName,
    programme: student.credential.programme,
    studentId: student.credential.studentNumber,
    studentNumber: student.credential.studentNumber,
    validFrom: validityWindow.validFrom.toISOString(),
    year: String(
      new Date(validityWindow.validFrom.getTime() + 7200000).getUTCFullYear(),
    ),
  };
  const value =
    values[attributeName] ?? student.credential.attributes?.[attributeName];

  if (!value) {
    throw new Error(
      `No student value is available for schema attribute "${attributeName}".`,
    );
  }

  return value;
}

export function attributesForStudent(
  student: StudentRecord,
  schemaAttributes: string[],
  validityWindow: CredentialValidityWindow,
) {
  return schemaAttributes.map((name) => ({
    name,
    value: attributeValue(student, name, validityWindow),
  }));
}

function batchIdFrom(now: Date) {
  return `batch-${now.getTime()}`;
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
/** Parses and bounds faculty, programme, status, and maximum-recipient filters. */
export function parseBatchIssuanceSelection(
  value: unknown,
): BatchIssuanceSelection {
  if (!value || typeof value !== "object") {
    return { cohortId: SIMULATED_STUDENT_COHORT_ID };
  }

  const record = value as Record<string, unknown>;
  const cohortId =
    optionalTrimmedString(record.cohortId) ?? SIMULATED_STUDENT_COHORT_ID;
  const faculty = optionalTrimmedString(record.faculty);
  const programme = optionalTrimmedString(record.programme);
  const credentialStatus = optionalTrimmedString(record.credentialStatus);
  const limit =
    record.limit === undefined || record.limit === ""
      ? undefined
      : Number(record.limit);

  if (
    credentialStatus &&
    !credentialStatuses.has(credentialStatus as CredentialLifecycleState)
  ) {
    throw new StudentIssuanceError(
      "Credential status filter is not valid.",
      400,
    );
  }

  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_ISSUANCE_LIMIT)
  ) {
    throw new StudentIssuanceError(
      `Batch issuance limit must be an integer between 1 and ${MAX_BATCH_ISSUANCE_LIMIT}.`,
      400,
    );
  }

  let options: RenewalOptions;
  try {
    options = parseRenewalOptions(record);
  } catch (error) {
    throw new StudentIssuanceError(
      error instanceof Error ? error.message : "Invalid renewal options.",
      400,
    );
  }
  return {
    cohortId,
    credentialStatus: credentialStatus as CredentialLifecycleState | undefined,
    faculty,
    limit,
    programme,
    ...options,
  };
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
    throw new Error(
      "Active credential schema with credential definition ID was not found.",
    );
  }

  return {
    credentialDefinitionId: activeSchema.credentialDefinitionId,
    revocationRegistryDefinitionId:
      activeSchema.revocationRegistryDefinitionId ?? undefined,
    schemaAttributes: activeSchema.schemaAttributes,
    schemaVersion: activeSchema.schemaVersion,
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
): Promise<BatchIssuanceResult> {
  const results = await mapWithConcurrency(
    studentsForIssuance,
    env.BATCH_ISSUANCE_PROCESSING_CONCURRENCY,
    async (student) => {
      try {
        return await queueRealStudentIssuance(
          student.profile.id,
          now,
          actorId,
          selection,
        );
      } catch (error) {
        return {
          failure: {
            externalId: student.profile.id,
            email: student.profile.email,
            message:
              error instanceof Error ? error.message : "Issuance failed.",
          },
        };
      }
    },
  );
  const deliveries = results.flatMap((result) =>
    "activationDeliveries" in result ? result.activationDeliveries : [],
  );
  return {
    batchId: batchIdFrom(now),
    cohortId: selection.cohortId ?? SIMULATED_STUDENT_COHORT_ID,
    requestedCount,
    status: "Queued",
    queuedAt: now.toISOString(),
    issuedCredentialIds: deliveries.map((delivery) => delivery.credentialId),
    activationDeliveries: deliveries,
    failures: results.flatMap((result) =>
      "failure" in result ? [result.failure] : [],
    ),
  };
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
/** Queues offers for eligible filtered students and preserves every per-item outcome. */
export async function queueRealBatchIssuance(
  selectionInputOrNow: BatchIssuanceSelection | Date = {},
  requestedNow = new Date(),
  actorId?: string | null,
): Promise<BatchIssuanceResult> {
  const now =
    selectionInputOrNow instanceof Date ? selectionInputOrNow : requestedNow;
  const selection =
    selectionInputOrNow instanceof Date
      ? {}
      : parseBatchIssuanceSelection(selectionInputOrNow);
  const studentsForIssuance = selectStudentRecordsForCredentialIssuance(
    await getAllStudents(),
    {
      ...selection,
      limit: selection.limit ?? MAX_BATCH_ISSUANCE_LIMIT,
    },
  );

  return issueStudentActivationLinks(
    studentsForIssuance,
    now,
    studentsForIssuance.length,
    selection,
    actorId,
  );
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
/** Issues a new credential offer for one eligible student. */
export async function queueRealStudentIssuance(
  studentId: string,
  now = new Date(),
  actorId?: string | null,
  options: RenewalOptions = {},
): Promise<BatchIssuanceResult> {
  const student = await getStudentById(studentId);
  if (!student)
    throw new StudentIssuanceError("Student record was not found.", 404);
  const current = await overlayCredentialStatusForStudent(student);
  const period = issuancePeriod(await currentValidityPolicy(), now);
  const revoked =
    current.credential.lifecycleState === "REVOKED"
      ? `:${current.credential.id}`
      : "";
  const key = `student-issuance:${student.credential.studentNumber}:${period.academicYear}${revoked}`;
  const replay = await prisma.credentialOfferAttempt.findUnique({
    where: { key },
  });
  if (!replay && !isStudentRecordEligibleForCredentialIssuance(current))
    throw new StudentIssuanceError(
      "Student credential is not ready for issuance in its current lifecycle state.",
      409,
    );
  const attempt =
    replay ?? (await prepareOffer({ key, student, now, actorId, options }));
  return offerResult(await deliverPreparedOffer(attempt), student, now);
}

export function offerResult(
  issuance: CredentialIssuance,
  student: StudentRecord,
  now: Date,
): BatchIssuanceResult {
  return {
    batchId: `issuance-${issuance.id}`,
    cohortId: "individual",
    requestedCount: 1,
    status: "Queued",
    queuedAt: now.toISOString(),
    issuedCredentialIds: [issuance.id],
    activationDeliveries: [
      {
        id: `delivery-${issuance.id}`,
        batchId: `issuance-${issuance.id}`,
        channel: "activation-link",
        credentialId: issuance.id,
        credentialExchangeId: issuance.credentialExchangeId ?? undefined,
        studentId: student.profile.id,
        activationId: issuance.activationId ?? undefined,
        activationUrl: issuance.activationUrl ?? "",
        email: issuance.email ?? undefined,
        emailStatus: "Sent",
        status: "Delivered",
        expiresAt: issuance.activationExpiresAt!.toISOString(),
      },
    ],
  };
}

/** Manual renewal is expired-only; annual processing uses enrolment records instead. */
export async function queueRealStudentRenewal(
  studentId: string,
  now = new Date(),
  actorId?: string | null,
  options: RenewalOptions = {},
): Promise<BatchIssuanceResult> {
  const student = await getStudentById(studentId);
  if (!student)
    throw new StudentIssuanceError("Student record was not found.", 404);
  const existing = await prisma.credentialIssuance.findFirst({
    where: {
      studentId: { in: [student.profile.id, student.credential.studentNumber] },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  if (
    !existing ||
    overlayCredentialStatus(student, existing).credential.lifecycleState !==
      "EXPIRED"
  )
    throw new StudentIssuanceError(
      "Manual renewal is only available for expired credentials.",
      409,
    );
  const period = issuancePeriod(await currentValidityPolicy(), now);
  const enrolment = await prisma.credentialRenewalEnrolment.findFirst({
    where: { studentId: student.credential.studentNumber, status: "ACTIVE" },
  });
  const record = enrolment
    ? await prisma.credentialRenewalRecord.findUnique({
        where: {
          enrolmentId_academicYear: {
            enrolmentId: enrolment.id,
            academicYear: period.academicYear,
          },
        },
      })
    : null;
  if (record?.preparedAt)
    throw new StudentIssuanceError(
      "A replacement already exists for this academic year. Recover it from Renewals.",
      409,
    );
  const attempt = await prepareOffer({
    key: `manual-renewal:${existing.id}:${period.academicYear}`,
    student,
    now,
    actorId,
    options: enrolment ? { autoRenew: false } : options,
    renewalId: record?.id,
    supersedesIssuanceId: existing.id,
  });
  return offerResult(await deliverPreparedOffer(attempt), student, now);
}

export async function queueCredentialIssuanceRenewal(
  issuanceId: string,
  now = new Date(),
  actorId?: string | null,
) {
  const existing = await prisma.credentialIssuance.findUniqueOrThrow({
    where: { id: issuanceId },
  });
  return queueRealStudentRenewal(existing.studentId, now, actorId);
}
