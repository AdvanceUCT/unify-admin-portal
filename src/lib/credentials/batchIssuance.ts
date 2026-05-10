import { buildWalletActivationLink } from "@/lib/api/activationLinks";
import { prisma } from "@/lib/db/prisma";
import { getAllStudentsFromSupabase, updateStudentLifecycleInSupabase } from "@/lib/db/store";
import { SIMULATED_STUDENT_COHORT_ID } from "@/lib/student-records/simulatedUniversityRecords";
import type { BatchIssuanceResult } from "@/lib/api/types";

export type BatchIssuanceFilters = {
  faculties?: string[];
  lifecycleStates?: string[];
  limit?: number;
};

function activationIdForToken(token: string) {
  return `activation-${token.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`;
}

function deliveryExpiryFrom(now: Date) {
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt.toISOString();
}

export async function queueBatchIssuance(
  filters: BatchIssuanceFilters = {},
  now = new Date()
): Promise<BatchIssuanceResult> {
  const queuedAt = now.toISOString();
  const batchId = `batch-${Date.now()}`;

  const {
    faculties = [],
    lifecycleStates = ["Pending", "Issuing"],
    limit = 100,
  } = filters;

  // Step 1 — get all students from Supabase
  const allStudents = await getAllStudentsFromSupabase();

  // Step 2 — apply filters
  const studentsForIssuance = allStudents
    .filter((s) => {
      const matchesFaculty =
        faculties.length === 0 || faculties.includes(s.credential.faculty ?? "");
      const matchesState = lifecycleStates.includes(s.credential.lifecycleState);
      const isRegistered = s.credential.enrolmentStatus === "Registered";
      return matchesFaculty && matchesState && isRegistered;
    })
    .slice(0, limit);

  if (studentsForIssuance.length === 0) {
    return {
      activationDeliveries: [],
      batchId,
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      issuedCredentialIds: [],
      queuedAt,
      requestedCount: limit,
      status: "Queued",
    };
  }

  // Step 3 — create IssuedCredential + ActivationDelivery for each student
  const activationDeliveries = await Promise.all(
    studentsForIssuance.map(async (student, index) => {
      const suffix = String(index + 1).padStart(3, "0");
      const token = `act-${batchId}-${suffix}`;
      const activationUrl = buildWalletActivationLink(token);
      const activationId = activationIdForToken(token);
      const expiresAt = deliveryExpiryFrom(now);
      const credentialId = `credential-${batchId}-${suffix}`;
      const deliveryId = `delivery-${batchId}-${suffix}`;

      // Create IssuedCredential record first
      await prisma.issuedCredential.create({
        data: {
          id: credentialId,
          studentId: student.profile.id,
          holderName: `${student.profile.firstName} ${student.profile.lastName}`,
          issuer: student.profile.institution,
          faculty: student.credential.faculty ?? "",
          programme: student.credential.programme,
          enrolmentStatus: student.credential.enrolmentStatus,
          lifecycleState: "Offered",
          studentNumber: student.credential.studentNumber,
          validFrom: student.credential.validFrom,
          expiresAt: student.credential.expiresAt,
          batchId,
          issuedAt: now,
        },
      });

      // Create ActivationDelivery linked to IssuedCredential
      await prisma.activationDelivery.create({
        data: {
          id: deliveryId,
          credentialId,
          studentId: student.profile.id,
          batchId,
          activationUrl,
          activationId,
          channel: "activation-link",
          status: "Delivered",
          deliveredAt: queuedAt,
          expiresAt,
        },
      });

      // Update student lifecycle state in Supabase
      await updateStudentLifecycleInSupabase(student.profile.id, "Offered");

      return {
        activationId,
        activationUrl,
        batchId,
        channel: "activation-link" as const,
        credentialId,
        deliveredAt: queuedAt,
        expiresAt,
        id: deliveryId,
        status: "Delivered" as const,
        studentId: student.profile.id,
        studentNumber: student.credential.studentNumber,
      };
    })
  );

  console.log("Saving batch record:", batchId);

  // Save batch summary record
  await prisma.batch.create({
    data: {
      id: batchId,
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      status: "Queued",
      requestedCount: limit,
      issuedCount: activationDeliveries.length,
      faculties: faculties.length > 0 ? faculties.join(", ") : "All",
      lifecycleStates: lifecycleStates.join(", "),
      queuedAt: now,
    },
  });

  console.log("Batch record saved successfully");

  return {
    activationDeliveries,
    batchId,
    cohortId: SIMULATED_STUDENT_COHORT_ID,
    issuedCredentialIds: activationDeliveries.map((d) => d.credentialId),
    queuedAt,
    requestedCount: limit,
    status: "Queued",
  };
}