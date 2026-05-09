import { buildWalletActivationLink } from "@/lib/api/activationLinks";
import { prisma } from "@/lib/db/prisma";
import { getPendingStudentsFromSupabase, updateStudentLifecycleInSupabase } from "@/lib/db/store";
import { selectStudentRecordsForCredentialIssuance, SIMULATED_STUDENT_COHORT_ID, SIMULATED_STUDENT_RECORD_COUNT } from "@/lib/student-records/simulatedUniversityRecords";
import type { BatchIssuanceResult } from "@/lib/api/types";

function activationIdForToken(token: string) {
  return `activation-${token.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`;
}

function deliveryExpiryFrom(now: Date) {
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt.toISOString();
}

export async function queueBatchIssuance(now = new Date()): Promise<BatchIssuanceResult> {
  const queuedAt = now.toISOString();
  const batchId = `batch-${Date.now()}`;

  // Step 1 — get Pending students from Supabase
  const pendingStudents = await getPendingStudentsFromSupabase();

  // Step 2 — select eligible students
  const studentsForIssuance = selectStudentRecordsForCredentialIssuance(pendingStudents, {
    cohortId: SIMULATED_STUDENT_COHORT_ID,
    limit: SIMULATED_STUDENT_RECORD_COUNT,
  });

  if (studentsForIssuance.length === 0) {
    return {
      activationDeliveries: [],
      batchId,
      cohortId: SIMULATED_STUDENT_COHORT_ID,
      issuedCredentialIds: [],
      queuedAt,
      requestedCount: SIMULATED_STUDENT_RECORD_COUNT,
      status: "Queued",
    };
  }

  // Step 3 — create activation deliveries and update lifecycle states
  const activationDeliveries = await Promise.all(
    studentsForIssuance.map(async (student, index) => {
      const token = `act-${batchId}-${String(index + 1).padStart(3, "0")}`;
      const activationUrl = buildWalletActivationLink(token);
      const activationId = activationIdForToken(token);
      const expiresAt = deliveryExpiryFrom(now);

      // Save activation delivery to Supabase
      await prisma.activationDelivery.create({
        data: {
          id: `delivery-${batchId}-${String(index + 1).padStart(3, "0")}`,
          credentialId: student.credential.id,
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

      // Update student lifecycle state to Offered
      await updateStudentLifecycleInSupabase(student.profile.id, "Offered");

      return {
        activationId,
        activationUrl,
        batchId,
        channel: "activation-link" as const,
        credentialId: student.credential.id,
        deliveredAt: queuedAt,
        expiresAt,
        id: `delivery-${batchId}-${String(index + 1).padStart(3, "0")}`,
        status: "Delivered" as const,
        studentId: student.profile.id,
      };
    })
  );

  return {
    activationDeliveries,
    batchId,
    cohortId: SIMULATED_STUDENT_COHORT_ID,
    issuedCredentialIds: activationDeliveries.map((d) => d.credentialId),
    queuedAt,
    requestedCount: SIMULATED_STUDENT_RECORD_COUNT,
    status: "Queued",
  };
}