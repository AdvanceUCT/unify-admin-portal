import "server-only";

import { CredentialIssuanceStatus } from "@/generated/prisma/enums";
import type { BatchIssuanceResult, StudentRecord } from "@/lib/api/types";
import { recordCredentialReissueRequestedAudit } from "@/lib/credentials/audit";
import { overlayCredentialStatusForStudent } from "@/lib/credentials/status";
import { getAllStudents, getStudentById } from "@/lib/db/store";
import { prisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/transaction";
import { issueSingleStudentActivationLink, StudentIssuanceError } from "@/lib/issuance/batchIssuance";

export { RENEWAL_CADENCE_PRESETS, type RenewalCadenceMonths } from "@/lib/credentials/renewalCadence";

export type RenewalTrigger = "AUTO" | "MANUAL";

export type RenewAllDueCredentialsSummary = {
  attempted: number;
  renewed: number;
  failed: { issuanceId: string; message: string }[];
};

/**
 * Finds issuances that are `ISSUED` but past their computed `expiresAt`.
 * Used by both the cron job and (indirectly) anyone auditing what's overdue.
 */
export async function findIssuancesDueForRenewal(now = new Date(), limit = 200) {
  return prisma.credentialIssuance.findMany({
    orderBy: { expiresAt: "asc" },
    take: limit,
    where: {
      expiresAt: { lte: now },
      status: CredentialIssuanceStatus.ISSUED,
    },
  });
}

/**
 * `CredentialIssuance.studentId` may hold either the student's `studentNumber`
 * or their `profile.id`, depending on which was available when the issuance
 * was created (see `overlayCredentialStatusForStudent`). Try a direct lookup
 * first, then fall back to matching by student number.
 */
async function findStudentForIssuanceStudentId(issuanceStudentId: string): Promise<StudentRecord | undefined> {
  const direct = await getStudentById(issuanceStudentId);
  if (direct) return direct;

  const allStudents = await getAllStudents();
  return allStudents.find((student) => student.credential.studentNumber === issuanceStudentId);
}

/**
 * Renews a single credential issuance.
 *
 * First, inside a transaction, flips the issuance from `ISSUED` to `EXPIRED`
 * (guarded by a status-checked `updateMany` so a concurrent renewal or
 * revocation can't double-process the same issuance) and writes a
 * `REISSUE_REQUESTED` audit entry. Once that's committed, reissues through
 * the normal single-student issuance pipeline, linked back via
 * `renewedFromIssuanceId` — the agent HTTP call can't run inside the
 * transaction, so it happens only after the expiry is durably recorded.
 *
 * @throws {StudentIssuanceError} If the issuance isn't found (404), isn't
 *   currently `ISSUED` (409), or the underlying student can't be found (404).
 */
export async function renewCredentialIssuance({
  actorId,
  issuanceId,
  trigger,
}: {
  actorId?: string | null;
  issuanceId: string;
  trigger: RenewalTrigger;
}): Promise<BatchIssuanceResult> {
  const expiredIssuance = await runSerializableTransaction(async (transaction) => {
    const current = await transaction.credentialIssuance.findUnique({ where: { id: issuanceId } });
    if (!current) {
      throw new StudentIssuanceError("Credential issuance was not found.", 404);
    }

    const result = await transaction.credentialIssuance.updateMany({
      data: { status: CredentialIssuanceStatus.EXPIRED },
      where: { id: issuanceId, status: CredentialIssuanceStatus.ISSUED },
    });

    if (result.count !== 1) {
      throw new StudentIssuanceError("This credential is not currently issued, so it cannot be renewed.", 409);
    }

    await recordCredentialReissueRequestedAudit(
      {
        actorId,
        credentialDefinitionId: current.credentialDefinitionId,
        credentialExchangeId: current.credentialExchangeId,
        credentialIssuanceId: current.id,
        studentId: current.studentId,
        trigger,
      },
      transaction,
    );

    return current;
  });

  const student = await findStudentForIssuanceStudentId(expiredIssuance.studentId);
  if (!student) {
    throw new StudentIssuanceError("Student record was not found.", 404);
  }

  const studentWithCredentialStatus = await overlayCredentialStatusForStudent(student);

  return issueSingleStudentActivationLink(studentWithCredentialStatus, new Date(), actorId, {
    renewedFromIssuanceId: expiredIssuance.id,
  });
}

/**
 * Batch driver for the renewal cron job: finds every `ISSUED` credential past
 * its expiry and renews it. Per-issuance failures are collected rather than
 * stopping the run, and two overlapping runs are naturally idempotent since
 * the status-guarded `updateMany` in `renewCredentialIssuance` means a second
 * run simply finds nothing left to claim for issuances already renewed.
 */
export async function renewAllDueCredentials(
  now = new Date(),
  actorId: string | null = null,
): Promise<RenewAllDueCredentialsSummary> {
  const due = await findIssuancesDueForRenewal(now);

  const results = await Promise.allSettled(
    due.map((issuance) => renewCredentialIssuance({ actorId, issuanceId: issuance.id, trigger: "AUTO" })),
  );

  const failed: { issuanceId: string; message: string }[] = [];
  let renewed = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      renewed += 1;
    } else {
      failed.push({
        issuanceId: due[index].id,
        message: result.reason instanceof Error ? result.reason.message : "Unknown renewal failure.",
      });
    }
  });

  return { attempted: due.length, failed, renewed };
}
