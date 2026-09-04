/** Durable scheduling and execution for credential renewal and lifecycle automation. */
import "server-only";

import type { CredentialAutomationJob } from "@/generated/prisma/client";
import {
  CredentialAuditAction,
  CredentialAutomationJobStatus,
  CredentialAutomationJobType,
  CredentialIssuanceStatus,
  CredentialLifecycleStatus,
  CredentialRenewalStatus,
} from "@/generated/prisma/enums";
import { requestCredentialLifecycleChange } from "@/lib/credentials/lifecycleActions";
import { nextRenewalAt, renewalCandidateCutoff } from "@/lib/credentials/renewalCadence";
import { prisma } from "@/lib/db/prisma";
import { queueCredentialIssuanceRenewal } from "@/lib/issuance/batchIssuance";
import { getUniversityProfile } from "@/lib/university/profile";

const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 10;
const RUN_LIMIT = 50;

class DeferredAutomationError extends Error {}
class CancelledAutomationError extends Error {}

export async function enqueueDueRenewals(now = new Date()) {
  const profile = await getUniversityProfile();
  if (!profile?.automaticCredentialRenewalEnabled) {
    await prisma.credentialAutomationJob.updateMany({
      data: { completedAt: now, status: CredentialAutomationJobStatus.CANCELLED },
      where: { status: CredentialAutomationJobStatus.PENDING, type: CredentialAutomationJobType.AUTO_RENEW },
    });
    return 0;
  }

  const candidates = await prisma.credentialIssuance.findMany({
    orderBy: { issuedAt: "asc" },
    take: RUN_LIMIT,
    where: {
      issuedAt: { lte: renewalCandidateCutoff(now, profile.renewalCadenceMonths) },
      lifecycleStatus: { in: [CredentialLifecycleStatus.ACTIVE, CredentialLifecycleStatus.EXPIRED] },
      renewedIntoIssuanceId: null,
      renewalStatus: { in: [CredentialRenewalStatus.NONE, CredentialRenewalStatus.FAILED] },
      status: CredentialIssuanceStatus.ISSUED,
    },
  });
  const issuances = candidates.filter((issuance) =>
    nextRenewalAt(issuance.issuedAt!, profile.renewalCadenceMonths) <= now,
  );

  await Promise.all(issuances.map(async (issuance) => {
    const deduplicationKey = `auto-renew:${issuance.id}`;
    const dueAt = nextRenewalAt(issuance.issuedAt!, profile.renewalCadenceMonths);
    await prisma.credentialAutomationJob.upsert({
      create: {
        credentialIssuanceId: issuance.id,
        deduplicationKey,
        dueAt,
        type: CredentialAutomationJobType.AUTO_RENEW,
      },
      update: {},
      where: { deduplicationKey },
    });
    await prisma.credentialAutomationJob.updateMany({
      data: { completedAt: null, dueAt, status: CredentialAutomationJobStatus.PENDING },
      where: {
        deduplicationKey,
        status: { in: [CredentialAutomationJobStatus.PENDING, CredentialAutomationJobStatus.CANCELLED] },
      },
    });
  }));
  return issuances.length;
}

async function claimNextDueJob(now: Date) {
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MINUTES * 60_000);
  const rows = await prisma.$queryRaw<CredentialAutomationJob[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "credential_automation_job"
      WHERE (
        ("status" = 'PENDING'::"CredentialAutomationJobStatus" AND "dueAt" <= ${now})
        OR ("status" = 'PROCESSING'::"CredentialAutomationJobStatus" AND "leaseExpiresAt" < ${now})
      )
      ORDER BY "dueAt" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "credential_automation_job" AS job
    SET "status" = 'PROCESSING'::"CredentialAutomationJobStatus",
        "attemptCount" = job."attemptCount" + 1,
        "processingStartedAt" = ${now},
        "lastAttemptAt" = ${now},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "updatedAt" = ${now}
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job.*
  `;
  return rows[0];
}

async function writeJobAudit(job: CredentialAutomationJob, action: CredentialAuditAction, message: string) {
  const issuance = await prisma.credentialIssuance.findUnique({ where: { id: job.credentialIssuanceId } });
  if (!issuance) return;
  await prisma.credentialAuditLog.create({
    data: {
      action,
      actorId: job.requestedByActorId,
      credentialDefinitionId: issuance.credentialDefinitionId,
      credentialExchangeId: issuance.credentialExchangeId,
      credentialIssuanceId: issuance.id,
      eventId: `automation:${job.id}:${job.attemptCount}:${action}`,
      message,
      metadata: { attemptCount: job.attemptCount, jobId: job.id, jobType: job.type },
      studentId: issuance.studentId,
    },
  });
}

async function executeJob(job: CredentialAutomationJob, now: Date) {
  const issuance = await prisma.credentialIssuance.findUnique({ where: { id: job.credentialIssuanceId } });
  if (!issuance) throw new Error("Credential issuance no longer exists.");

  if (job.type === CredentialAutomationJobType.AUTO_RENEW) {
    if (issuance.lifecycleStatus === CredentialLifecycleStatus.SUSPENDED) {
      throw new DeferredAutomationError("Credential is suspended; renewal deferred until it is active.");
    }
    if (issuance.lifecycleStatus === CredentialLifecycleStatus.REVOKED) {
      throw new CancelledAutomationError("Credential was revoked before automatic renewal.");
    }
    await writeJobAudit(job, CredentialAuditAction.CREDENTIAL_RENEWAL_REQUESTED, "Automatic credential renewal requested.");
    await queueCredentialIssuanceRenewal(issuance.id, now, null, job.deduplicationKey);
    return;
  }

  const action = job.type === CredentialAutomationJobType.AUTO_REACTIVATE ? "reactivate" : "revoke";
  if (action === "reactivate" && issuance.lifecycleStatus === CredentialLifecycleStatus.ACTIVE) return;
  if (issuance.lifecycleStatus === CredentialLifecycleStatus.REVOKED) {
    if (action === "revoke") return;
    throw new CancelledAutomationError("Credential was revoked before scheduled reactivation.");
  }
  await requestCredentialLifecycleChange({
    action,
    credentialIssuanceId: issuance.id,
    reason: action === "reactivate" ? "Scheduled suspension duration ended." : "Replacement credential activated.",
    studentId: issuance.studentId,
  });
}

async function processClaimedJob(job: CredentialAutomationJob, now: Date) {
  try {
    await executeJob(job, now);
    await prisma.credentialAutomationJob.update({
      data: { completedAt: new Date(), lastError: null, leaseExpiresAt: null, status: CredentialAutomationJobStatus.SUCCEEDED },
      where: { id: job.id },
    });
    return { id: job.id, status: "succeeded" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Credential automation failed.";
    if (error instanceof DeferredAutomationError) {
      await prisma.credentialAutomationJob.update({
        data: {
          attemptCount: Math.max(0, job.attemptCount - 1),
          dueAt: new Date(now.getTime() + 24 * 60 * 60_000),
          lastError: message,
          leaseExpiresAt: null,
          status: CredentialAutomationJobStatus.PENDING,
        },
        where: { id: job.id },
      });
      return { id: job.id, status: "deferred" as const };
    }
    if (error instanceof CancelledAutomationError) {
      await prisma.credentialAutomationJob.update({
        data: { completedAt: new Date(), lastError: message, leaseExpiresAt: null, status: CredentialAutomationJobStatus.CANCELLED },
        where: { id: job.id },
      });
      return { id: job.id, status: "cancelled" as const };
    }
    const finalFailure = job.attemptCount >= MAX_ATTEMPTS;
    await prisma.credentialAutomationJob.update({
      data: {
        dueAt: finalFailure ? job.dueAt : new Date(now.getTime() + 24 * 60 * 60_000),
        lastError: message,
        leaseExpiresAt: null,
        status: finalFailure ? CredentialAutomationJobStatus.FAILED : CredentialAutomationJobStatus.PENDING,
      },
      where: { id: job.id },
    });
    await writeJobAudit(
      job,
      finalFailure
        ? CredentialAuditAction.CREDENTIAL_AUTOMATION_FAILED
        : CredentialAuditAction.CREDENTIAL_AUTOMATION_RETRY_SCHEDULED,
      finalFailure ? message : `${message} Retrying on the next daily run.`,
    );
    return { error: message, id: job.id, status: finalFailure ? "failed" as const : "retrying" as const };
  }
}

export async function runCredentialAutomation(now = new Date(), limit = RUN_LIMIT) {
  const queuedRenewals = await enqueueDueRenewals(now);
  const results: Awaited<ReturnType<typeof processClaimedJob>>[] = [];
  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextDueJob(now);
    if (!job) break;
    results.push(await processClaimedJob(job, now));
  }
  return {
    failed: results.filter((result) => result.status === "failed").length,
    cancelled: results.filter((result) => result.status === "cancelled").length,
    deferred: results.filter((result) => result.status === "deferred").length,
    processed: results.length,
    queuedRenewals,
    retrying: results.filter((result) => result.status === "retrying").length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
  };
}

export async function retryCredentialAutomationJob(jobId: string, actorId: string | null) {
  const now = new Date();
  const job = await prisma.credentialAutomationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== CredentialAutomationJobStatus.FAILED) {
    throw new Error("Failed credential automation job was not found.");
  }
  const reset = await prisma.credentialAutomationJob.update({
    data: {
      attemptCount: 1,
      dueAt: now,
      lastError: null,
      requestedByActorId: actorId ?? job.requestedByActorId,
      status: CredentialAutomationJobStatus.PROCESSING,
    },
    where: { id: job.id },
  });
  return processClaimedJob(reset, now);
}
