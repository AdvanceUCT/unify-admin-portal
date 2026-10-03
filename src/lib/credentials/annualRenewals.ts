import "server-only";
import { randomUUID } from "node:crypto";
import type { CredentialRenewalRecord } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  prepareOffer,
  deliverPreparedOffer,
  RenewalNotDueError,
  RenewalCancelledError,
  RenewalLeaseLostError,
  RenewalAlreadyPreparedError,
} from "./preparedOffer";
import { getStudentById, getAllStudents } from "@/lib/students/repository";
import { requestCredentialLifecycleChange } from "./lifecycleActions";

export async function cancelRenewalEnrolment(id: string, actorId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(207206)`;
    const enrolment = await tx.credentialRenewalEnrolment.findUniqueOrThrow({
      where: { id },
    });
    if (enrolment.status !== "ACTIVE") return;
    await tx.credentialRenewalEnrolment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: actorId,
      },
    });
    await tx.credentialRenewalRecord.updateMany({
      where: { enrolmentId: id, preparedAt: null },
      data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null },
    });
    await tx.auditLog.create({
      data: {
        action: "SETTINGS_UPDATED",
        actorId,
        targetType: "CredentialRenewalEnrolment",
        targetId: id,
        meta: {
          action: "AUTO_RENEWAL_CANCELLED",
          studentId: enrolment.studentId,
        },
      },
    });
  });
}

export async function latestAuthoritativeCredential(studentIds: string[]) {
  const attempts = await prisma.credentialOfferAttempt.findMany({
    where: { studentId: { in: studentIds }, issuanceId: { not: null } },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });
  const credentials = await prisma.credentialIssuance.findMany({
    where: {
      studentId: { in: studentIds },
      OR: [
        { status: "ISSUED" },
        { status: "REVOKED", issuedAt: { not: null } },
      ],
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });
  return (
    attempts
      .map((attempt) =>
        credentials.find((credential) => credential.id === attempt.issuanceId),
      )
      .find(Boolean) ??
    credentials[0] ??
    null
  );
}

export async function claimAnnualRenewal(now: Date) {
  const token = randomUUID();
  const rows = await prisma.$queryRaw<CredentialRenewalRecord[]>`
    WITH candidate AS (
      SELECT r.id FROM credential_renewal_record r JOIN credential_renewal_enrolment e ON e.id = r."enrolmentId"
      WHERE (e.status = 'ACTIVE' OR r."preparedAt" IS NOT NULL)
        AND r."expiresAt" > ${now}
        AND ((r.status IN ('SCHEDULED', 'DEFERRED', 'RETRYING') AND (r."dueAt" <= ${now} OR r."preparedAt" IS NOT NULL) AND (r."retryAt" IS NULL OR r."retryAt" <= ${now}))
          OR (r.status = 'PROCESSING' AND (r."leaseExpiresAt" IS NULL OR r."leaseExpiresAt" < ${now})))
      ORDER BY r."dueAt", r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED
    ) UPDATE credential_renewal_record r SET status = 'PROCESSING', "attemptCount" = r."attemptCount" + 1,
      "leaseExpiresAt" = ${new Date(now.getTime() + 600_000)}, "leaseToken" = ${token}, "updatedAt" = ${now}
      FROM candidate WHERE r.id = candidate.id RETURNING r.*`;
  return rows[0];
}

export async function processAnnualRenewal(
  record: CredentialRenewalRecord,
  now: Date,
) {
  const finish = (
    data: Parameters<
      typeof prisma.credentialRenewalRecord.updateMany
    >[0]["data"],
  ) =>
    prisma.credentialRenewalRecord.updateMany({
      where: { id: record.id, leaseToken: record.leaseToken },
      data: { ...data, leaseToken: null, leaseExpiresAt: null },
    });
  try {
    const owned = await prisma.credentialRenewalRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    if (owned.status === "CANCELLED") return "cancelled";
    if (
      owned.leaseToken !== record.leaseToken ||
      !owned.leaseExpiresAt ||
      owned.leaseExpiresAt <= now
    )
      throw new RenewalLeaseLostError(
        "Renewal processing lease has been reclaimed.",
      );
    if (record.attemptCount > 5)
      throw new Error(
        "Five automatic attempts were interrupted; administrator retry is required.",
      );
    let attempt = record.activeAttemptId
      ? await prisma.credentialOfferAttempt.findUniqueOrThrow({
          where: { id: record.activeAttemptId },
        })
      : null;
    if (!attempt) {
      const enrolment =
        await prisma.credentialRenewalEnrolment.findUniqueOrThrow({
          where: { id: record.enrolmentId },
        });
      const student =
        (await getStudentById(enrolment.studentId)) ??
        (await getAllStudents()).find(
          (item) => item.credential.studentNumber === enrolment.studentId,
        );
      if (!student) throw new Error("Student record was not found.");
      const authoritative = await latestAuthoritativeCredential([
        student.profile.id,
        student.credential.studentNumber,
      ]);
      if (
        authoritative?.lifecycleStatus === "REVOKED" ||
        authoritative?.status === "REVOKED"
      ) {
        await cancelRenewalEnrolment(enrolment.id, "system:revocation");
        return "cancelled";
      }
      if (authoritative?.lifecycleStatus === "SUSPENDED") {
        await finish({
          status: "DEFERRED",
          attemptCount: Math.max(0, record.attemptCount - 1),
          retryAt: new Date(now.getTime() + 3_600_000),
          lastError: "Credential suspended; waiting for reactivation.",
        });
        return "deferred";
      }
      attempt = await prepareOffer({
        key: `annual-renewal:${record.id}:1`,
        student,
        now,
        renewalId: record.id,
        automatic: true,
        supersedesIssuanceId: authoritative?.id,
      });
    }
    const issuance = await deliverPreparedOffer(attempt, record.leaseToken);
    await finish({
      status:
        issuance.status === "ISSUED" ? "ACTIVATED" : "AWAITING_ACTIVATION",
      retryAt: null,
      lastError: null,
    });
    return "succeeded";
  } catch (error) {
    if (
      error instanceof RenewalLeaseLostError ||
      error instanceof RenewalAlreadyPreparedError
    )
      return "deferred";
    if (error instanceof RenewalCancelledError) return "cancelled";
    if (error instanceof RenewalNotDueError) {
      await finish({
        status: "SCHEDULED",
        dueAt: error.dueAt,
        expiresAt: error.expiresAt,
        attemptCount: Math.max(0, record.attemptCount - 1),
        retryAt: null,
      });
      return "deferred";
    }
    const message =
      error instanceof Error ? error.message : "Automatic renewal failed.";
    const status = message.includes("Activation offer expired")
      ? "NEEDS_ATTENTION"
      : record.attemptCount >= 5
        ? "FAILED"
        : "RETRYING";
    await finish({
      status,
      lastError: message,
      retryAt:
        status === "RETRYING" ? new Date(now.getTime() + 3_600_000) : null,
    });
    return status === "RETRYING" ? "retrying" : "failed";
  }
}

export async function runAnnualRenewals(
  now = new Date(),
  deadline = Date.now() + 240_000,
) {
  await prisma.credentialRenewalRecord.updateMany({
    where: {
      status: { in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "SKIPPED",
      lastError: "Academic period elapsed before renewal was delivered.",
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
  await prisma.$executeRaw`
    UPDATE credential_renewal_record r SET
      status = CASE WHEN i.status = 'ISSUED' THEN 'ACTIVATED' ELSE 'NEEDS_ATTENTION' END,
      "activatedAt" = CASE WHEN i.status = 'ISSUED' THEN i."issuedAt" ELSE r."activatedAt" END,
      "lastError" = CASE WHEN i.status = 'ISSUED' THEN NULL ELSE 'Student did not activate this offer; explicit replacement is required.' END,
      "updatedAt" = ${now}
    FROM credential_issuance i WHERE r."replacementIssuanceId" = i.id AND r.status = 'AWAITING_ACTIVATION'
      AND (i.status IN ('ISSUED', 'FAILED') OR i."activationExpiresAt" <= ${now})`;
  const totals = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    deferred: 0,
    cancelled: 0,
  };
  while (Date.now() < deadline) {
    // Four concurrent jobs; stop claiming early enough for a bounded agent call.
    const jobs = [];
    for (let index = 0; index < 4; index++) {
      const job = await claimAnnualRenewal(now);
      if (job) jobs.push(job);
    }
    if (!jobs.length) break;
    for (const result of await Promise.all(
      jobs.map((job) => processAnnualRenewal(job, now)),
    )) {
      totals.processed++;
      totals[result]++;
    }
  }
  const completed = await prisma.credentialRenewalEnrolment.findMany({
    where: {
      status: "ACTIVE",
      records: {
        none: {
          status: { in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING"] },
        },
      },
    },
    select: { id: true, finalYear: true },
  });
  // Awaiting acceptance does not extend the enrolment, but retains its outcome history.
  for (const enrolment of completed)
    await prisma.credentialRenewalEnrolment.update({
      where: { id: enrolment.id },
      data: { status: "COMPLETED" },
    });
  return totals;
}

export async function retryAnnualRenewal(
  id: string,
  actorId: string,
  replace = false,
) {
  const now = new Date();
  const record = await prisma.credentialRenewalRecord.findUniqueOrThrow({
    where: { id },
    include: { enrolment: true },
  });
  if (
    !record.preparedAt ||
    !["FAILED", "NEEDS_ATTENTION"].includes(record.status) ||
    record.expiresAt <= now
  )
    throw new Error("Only a failed, unexpired renewal can be recovered.");
  if (replace) {
    const previous = await prisma.credentialOfferAttempt.findUniqueOrThrow({
      where: { id: record.activeAttemptId! },
    });
    if (previous.issuanceId) {
      const issuance = await prisma.credentialIssuance.findUniqueOrThrow({
        where: { id: previous.issuanceId },
      });
      if (issuance.status === "ISSUED")
        throw new Error("This offer has already been activated.");
      if (!issuance.activationExpiresAt || issuance.activationExpiresAt > now)
        throw new Error(
          "Replacement offers require an expired activation offer. Retry delivery for an unexpired offer.",
        );
      if (
        issuance.revocationRegistryDefinitionId &&
        issuance.credentialRevocationId &&
        issuance.lifecycleStatus !== "REVOKED"
      )
        await requestCredentialLifecycleChange({
          action: "revoke",
          credentialIssuanceId: issuance.id,
          studentId: issuance.studentId,
          actorId,
          reason:
            "Expired activation offer superseded by explicit replacement.",
        });
      else if (
        !issuance.activationExpiresAt ||
        issuance.activationExpiresAt > now
      )
        throw new Error(
          "Cannot safely replace an offer until it expires or can be revoked.",
        );
    }
    const student =
      (await getStudentById(previous.studentId)) ??
      (await getAllStudents()).find(
        (item) => item.credential.studentNumber === previous.studentId,
      );
    if (!student) throw new Error("Student record was not found.");
    await prepareOffer({
      key: `annual-renewal:${id}:replacement:${randomUUID()}`,
      student,
      now,
      renewalId: id,
      automatic: previous.automatic,
      recovery: true,
      supersedesIssuanceId: previous.supersedesIssuanceId ?? undefined,
      actorId,
    });
  } else {
    if (record.status === "NEEDS_ATTENTION")
      throw new Error(
        "Create a replacement offer to recover an expired activation link.",
      );
    const reset = await prisma.credentialRenewalRecord.updateMany({
      where: { id, status: "FAILED" },
      data: {
        status: "RETRYING",
        attemptCount: 0,
        retryAt: now,
        lastError: null,
      },
    });
    if (!reset.count) throw new Error("Renewal recovery is already running.");
  }
  await prisma.auditLog.create({
    data: {
      action: "SETTINGS_UPDATED",
      actorId,
      targetType: "CredentialRenewalRecord",
      targetId: id,
      meta: {
        action: replace
          ? "REPLACEMENT_OFFER_REQUESTED"
          : "RENEWAL_RETRY_REQUESTED",
      },
    },
  });
}
